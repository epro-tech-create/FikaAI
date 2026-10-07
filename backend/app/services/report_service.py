"""Student attendance reports: daily / weekly / monthly JSON + PDF."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from io import BytesIO
from typing import Any, Literal

from app.core.config import settings
from app.models.entities import (AttendanceRecord, AttendanceSession, Student,
                                 User)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

Period = Literal["daily", "weekly", "monthly", "custom", "all"]
WEEKDAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri")
# One-off: 31 Aug 2026 is treated as arrived early. From 2 Sep scoring is live again.
FORCED_EARLY_DATES = frozenset({date(2026, 8, 31)})

MAX_CUSTOM_DAYS = 186


def attendance_day_summary(statuses: list[str]) -> dict[str, int | float]:
    """Count dates, including late arrivals, rather than attendance records."""
    total = len(statuses)
    present = sum(value in ("Present", "Late") for value in statuses)
    excused = statuses.count("Excused")
    return {
        "totalDays": total,
        "daysPresent": present,
        "lateDays": statuses.count("Late"),
        "excusedDays": excused,
        "absentDays": total - present - excused,
        "attendanceRate": round(present / total * 100, 1) if total else 0.0,
    }


def _day_priority(status: str) -> int:
    return {"Present": 3, "Late": 2, "Excused": 1}.get(status, 0)


def parse_period(value: str) -> Period:
    if value not in ("daily", "weekly", "monthly", "custom", "all"):
        raise ValueError("Period must be daily, weekly, monthly, custom, or all.")
    return value  # type: ignore[return-value]


BLUE_SOFT = colors.HexColor("#3b9cff")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
LINE = colors.HexColor("#dbe7f0")
ROW_ALT = colors.HexColor("#f3f8fc")
HEADER_BG = colors.HexColor("#0b1520")
# White table headers (no black boxes) — header row is white with dark text
TABLE_HEADER_BG = colors.white
TABLE_HEADER_TEXT = INK


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def friday_of(day: date) -> date:
    return monday_of(day) + timedelta(days=4)


def month_span(day: date) -> tuple[date, date]:
    last = monthrange(day.year, day.month)[1]
    return date(day.year, day.month, 1), date(day.year, day.month, last)


def status_label(status: str) -> str:
    if status == "ABSENT":
        return "—"
    if status == "EXCUSED":
        return "Excused"
    if status == "PRESENT":
        return "Arrived early"
    if status == "LATE":
        return "Late"
    if status == "CHECKED_OUT":
        return "Checked out"
    return status.replace("_", " ").title()


def arrival_was_late(
    check_in_at: datetime | None,
    official_start: time,
    session_date: date,
    late_threshold_minutes: int = 0,
) -> bool:
    """True if the student arrived at or after official start (09:30 by default)."""
    if check_in_at is None:
        return False
    local = (
        check_in_at.astimezone(settings.campus_tz)
        if check_in_at.tzinfo
        else check_in_at.replace(tzinfo=settings.campus_tz)
    )
    official = datetime.combine(session_date, official_start, tzinfo=settings.campus_tz)
    return local >= official + timedelta(minutes=late_threshold_minutes)


def record_was_late(
    status: str,
    check_in_at: datetime | None,
    official_start: time,
    session_date: date,
    late_threshold_minutes: int = 0,
) -> bool:
    if session_date in FORCED_EARLY_DATES:
        return False
    return status == "LATE" or arrival_was_late(
        check_in_at,
        official_start,
        session_date,
        late_threshold_minutes,
    )


def _cell_text(value: Any) -> str:
    text = str(value or "").strip()
    return text or "—"


def _public_student_id(item: dict[str, Any]) -> str:
    return _cell_text(item.get("membershipId"))


def _registration_number(item: dict[str, Any]) -> str:
    return _cell_text(item.get("registrationNumber"))


def _format_time(value: datetime | None) -> str:
    if value is None:
        return "—"
    local = (
        value.astimezone(settings.campus_tz)
        if value.tzinfo
        else value.replace(tzinfo=settings.campus_tz)
    )
    return local.strftime("%H:%M")


def _human_date(day: date, *, month_year: bool = False) -> str:
    if month_year:
        return day.strftime("%B %Y")
    text = day.strftime("%d %b %Y")
    return text[1:] if text.startswith("0") else text


def _period_window(
    period: Period,
    anchor: date,
    start_override: date | None = None,
    end_override: date | None = None,
) -> tuple[date, date, str]:
    if period == "daily":
        return anchor, anchor, f"Daily attendance · {_human_date(anchor)}"
    if period == "weekly":
        start, end = monday_of(anchor), friday_of(anchor)
        return (
            start,
            end,
            f"Weekly attendance · {_human_date(start)} – {_human_date(end)}",
        )
    if period == "custom":
        if start_override is None or end_override is None:
            raise ValueError("Custom period requires startDate and endDate.")
        if end_override < start_override:
            raise ValueError("endDate must be on or after startDate.")
        if (end_override - start_override).days + 1 > MAX_CUSTOM_DAYS:
            raise ValueError(f"Custom range too long (max {MAX_CUSTOM_DAYS} days).")
        return (
            start_override,
            end_override,
            f"Custom attendance · {_human_date(start_override)} – {_human_date(end_override)}",
        )
    start, end = month_span(anchor)
    return start, end, f"Monthly attendance · {_human_date(start, month_year=True)}"


def _enumerate_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def _month_groups(days: list[date]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for d in days:
        label = d.strftime("%B %Y")
        if groups and groups[-1]["month"] == label:
            groups[-1]["span"] += 1
            groups[-1]["dates"].append(d.isoformat())
        else:
            groups.append({"month": label, "span": 1, "dates": [d.isoformat()]})
    return groups


async def _records_between(
    db: AsyncSession, start: date, end: date
) -> list[tuple[AttendanceRecord, AttendanceSession, Student, User]]:
    result = await db.execute(
        select(AttendanceRecord, AttendanceSession, Student, User)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(User, User.id == Student.user_id)
        .where(
            AttendanceSession.session_date >= start,
            AttendanceSession.session_date <= end,
        )
        .order_by(
            AttendanceSession.session_date,
            AttendanceRecord.check_in_at,
            Student.registration_number,
        )
    )
    # Weekends are excluded from both detail rows and attendance totals.
    return [row for row in result.all() if row[1].session_date.weekday() < 5]


async def weekly_attendance_series(db: AsyncSession, week_of: date) -> dict[str, Any]:
    start, end = monday_of(week_of), friday_of(week_of)
    rows = await _records_between(db, start, end)
    by_day: dict[date, list[AttendanceRecord]] = {
        start + timedelta(days=offset): [] for offset in range(5)
    }
    for record, session, _student, _user in rows:
        bucket = by_day.get(session.session_date)
        if bucket is not None:
            bucket.append(record)
    series = []
    for offset, label in enumerate(WEEKDAY_LABELS):
        day = start + timedelta(days=offset)
        day_rows = by_day[day]
        series.append(
            {
                "day": label,
                "date": day.isoformat(),
                "arrivals": len(day_rows),
                "departures": sum(
                    1 for item in day_rows if item.check_out_at is not None
                ),
            }
        )
    return {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "label": f"{_human_date(start)} – {_human_date(end)}",
        "days": series,
        "arrivals": sum(point["arrivals"] for point in series),
        "departures": sum(point["departures"] for point in series),
    }


async def _report_window(
    db: AsyncSession, period: Period, anchor: date,
    start_override: date | None = None, end_override: date | None = None,
) -> tuple[date, date, str]:
    if period == "all":
        first, last = (await db.execute(
            select(func.min(AttendanceSession.session_date), func.max(AttendanceSession.session_date))
            .where(AttendanceSession.session_date <= anchor)
            .where(func.extract("isodow", AttendanceSession.session_date) <= 5)
        )).one()
        start, end = first or anchor, last or anchor
        title = f"Full attendance · {start.isoformat()} – {end.isoformat()}"
    else:
        return _period_window(period, anchor, start_override, end_override)
    return start, end, title


async def build_attendance_report(
    db: AsyncSession,
    period: Period,
    anchor: date,
    start_override: date | None = None,
    end_override: date | None = None,
) -> dict[str, Any]:
    start, end, title = await _report_window(db, period, anchor, start_override, end_override)
    packed = await _records_between(db, start, end)
    days = _enumerate_days(start, end)
    month_groups = _month_groups(days)
    day_metas = [
        {
            "date": d.isoformat(),
            "label": d.strftime("%a"),
            "dayNum": d.strftime("%d").lstrip("0") or "0",
            "month": d.strftime("%B %Y"),
            "weekday": (
                WEEKDAY_LABELS[d.weekday()] if d.weekday() < 5 else d.strftime("%a")
            ),
        }
        for d in days
    ]
    # All active students so monthly/custom shows absentees too
    all_students_rows = (
        await db.execute(
            select(Student, User)
            .join(User, User.id == Student.user_id)
            .order_by(User.full_name)
        )
    ).all()
    students: dict[str, dict[str, Any]] = {}
    for student, user in all_students_rows:
        sid = str(student.id)
        students[sid] = {
            "studentId": sid,
            "studentName": user.full_name,
            "email": user.email,
            "membershipId": student.membership_id,
            "registrationNumber": student.registration_number,
            "yearOfStudy": student.year_of_study,
            "status": (
                student.status.value
                if hasattr(student.status, "value")
                else str(student.status)
            ),
            "daysPresent": 0,
            "lateDays": 0,
            "excusedDays": 0,
            "absentDays": 0,
            "days": {label: "—" for label in WEEKDAY_LABELS},
            "daysByDate": {d.isoformat(): "—" for d in days},
        }
    rows = []
    arrived_early = late = checked_out = excused = 0
    by_day: dict[str, int] = {}
    seen_with_record: set[str] = set()
    for record, session, student, user in packed:
        status = (
            record.status.value
            if hasattr(record.status, "value")
            else str(record.status)
        )
        if status == "EXCUSED":
            excused += 1
        elif status == "ABSENT":
            pass
        else:
            was_late = record_was_late(
                status,
                record.check_in_at,
                session.official_start,
                session.session_date,
                session.late_threshold_minutes,
            )
            if was_late:
                late += 1
            else:
                arrived_early += 1
            if record.check_out_at is not None or status == "CHECKED_OUT":
                checked_out += 1
        day_key = session.session_date.isoformat()
        by_day[day_key] = by_day.get(day_key, 0) + 1
        weekday = (
            WEEKDAY_LABELS[session.session_date.weekday()]
            if session.session_date.weekday() < 5
            else session.session_date.strftime("%a")
        )
        rows.append(
            {
                "id": str(record.id),
                "day": weekday,
                "date": day_key,
                "studentName": user.full_name,
                "membershipId": student.membership_id,
                "registrationNumber": student.registration_number,
                "arrivedAt": (
                    record.check_in_at.isoformat() if record.check_in_at else None
                ),
                "checkedOutAt": (
                    record.check_out_at.isoformat() if record.check_out_at else None
                ),
                "status": status,
            }
        )
        sid = str(student.id)
        seen_with_record.add(sid)
        card = students.get(sid)
        if card is None:
            card = students.setdefault(
                sid,
                {
                    "studentId": sid,
                    "studentName": user.full_name,
                    "email": user.email,
                    "membershipId": student.membership_id,
                    "registrationNumber": student.registration_number,
                    "yearOfStudy": student.year_of_study,
                    "status": (
                        student.status.value
                        if hasattr(student.status, "value")
                        else str(student.status)
                    ),
                    "daysPresent": 0,
                    "lateDays": 0,
                    "excusedDays": 0,
                    "absentDays": 0,
                    "days": {label: "—" for label in WEEKDAY_LABELS},
                    "daysByDate": {d.isoformat(): "—" for d in days},
                },
            )
        cell = (
            "—"
            if status == "ABSENT"
            else (
                "Excused"
                if status == "EXCUSED"
                else ("Late" if was_late else "Present")
            )
        )
        if day_key in card["daysByDate"] and _day_priority(cell) >= _day_priority(card["daysByDate"][day_key]):
            card["daysByDate"][day_key] = cell
        if session.session_date.weekday() < 5 and period == "weekly":
            card["days"][WEEKDAY_LABELS[session.session_date.weekday()]] = card["daysByDate"][day_key]

    # For monthly/custom: fill weekly-style days from first week + compute absentDays + rate
    student_list = list(students.values())
    for card in student_list:
        card.update(attendance_day_summary(list(card["daysByDate"].values())))
        if period in ("monthly", "custom", "all"):
            # backfill Mon-Fri labels from first Mon-Fri in range for legacy weekly UI
            for d in days:
                if d.weekday() < 5:
                    card["days"][WEEKDAY_LABELS[d.weekday()]] = card["daysByDate"].get(
                        d.isoformat(), "—"
                    )

    return {
        "period": period,
        "title": title,
        "date": anchor.isoformat(),
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "timezone": settings.campus_timezone,
        "location": "DIT RAFIC",
        "days": day_metas,
        "monthGroups": month_groups,
        "summary": {
            "totalRecords": len(rows),
            "studentsPresent": len(seen_with_record),
            "totalStudents": len(student_list),
            "arrivedEarly": arrived_early,
            "late": late,
            "checkedOut": checked_out,
            "excused": excused,
            "absent": sum(
                1
                for r, _, _, _ in packed
                if (r.status.value if hasattr(r.status, "value") else str(r.status))
                == "ABSENT"
            ),
        },
        "dayCounts": [
            {"date": day, "arrivals": count} for day, count in sorted(by_day.items())
        ],
        "rows": rows,
        "students": student_list,
    }


async def build_student_report(
    db: AsyncSession,
    student_id: Any,
    period: Period,
    anchor: date,
    start_override: date | None = None,
    end_override: date | None = None,
) -> dict[str, Any]:
    start, end, title = await _report_window(db, period, anchor, start_override, end_override)
    days = _enumerate_days(start, end)
    result = await db.execute(
        select(Student, User)
        .join(User, User.id == Student.user_id)
        .where(Student.id == student_id)
    )
    found = result.one_or_none()
    if found is None:
        from app.core.errors import ApiError, ErrorCode

        raise ApiError(ErrorCode.NOT_FOUND, "Student not found.", 404)
    student, user = found
    packed = await _records_between(db, start, end)
    entries: dict[str, dict[str, Any]] = {
        d.isoformat(): {
            "date": d.isoformat(),
            "label": d.strftime("%a %d %b"),
            "month": d.strftime("%B %Y"),
            "status": "Absent",
            "arrivedAt": None,
            "checkedOutAt": None,
        }
        for d in days
    }
    for record, session, s, _u in packed:
        if str(s.id) != str(student.id):
            continue
        status = (
            record.status.value
            if hasattr(record.status, "value")
            else str(record.status)
        )
        was_late = record_was_late(
            status,
            record.check_in_at,
            session.official_start,
            session.session_date,
            session.late_threshold_minutes,
        )
        key = session.session_date.isoformat()
        if key not in entries:
            continue
        cell = (
            "Absent"
            if status == "ABSENT"
            else (
                "Excused"
                if status == "EXCUSED"
                else ("Late" if was_late else "Present")
            )
        )
        if _day_priority(cell) < _day_priority(entries[key]["status"]):
            continue
        entries[key] = {
            "date": key,
            "label": session.session_date.strftime("%a %d %b"),
            "month": session.session_date.strftime("%B %Y"),
            "status": cell,
            "rawStatus": status,
            "arrivedAt": record.check_in_at.isoformat() if record.check_in_at else None,
            "checkedOutAt": (
                record.check_out_at.isoformat() if record.check_out_at else None
            ),
        }
    return {
        "period": period,
        "title": f"{user.full_name} · {title}",
        "date": anchor.isoformat(),
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "timezone": settings.campus_timezone,
        "student": {
            "studentId": str(student.id),
            "studentName": user.full_name,
            "email": user.email,
            "membershipId": student.membership_id,
            "registrationNumber": student.registration_number,
            "yearOfStudy": student.year_of_study,
            "status": (
                student.status.value
                if hasattr(student.status, "value")
                else str(student.status)
            ),
        },
        "summary": attendance_day_summary([entry["status"] for entry in entries.values()]),
        "days": list(entries.values()),
        "monthGroups": _month_groups(days),
    }


def _short_cell(value: str) -> str:
    if value == "Present":
        return "P"
    if value == "Late":
        return "L"
    if value == "Excused":
        return "E"
    return "—"


def render_student_pdf(report: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    pagesize = A4
    heading_style = ParagraphStyle(
        "CcdHeading",
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=INK,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "CcdBody", fontName="Helvetica", fontSize=9, textColor=INK, leading=12
    )
    cell_style = ParagraphStyle(
        "CcdCell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10
    )
    cell_center = ParagraphStyle(
        "CcdCellCenter", parent=cell_style, alignment=TA_CENTER
    )
    header_style = ParagraphStyle(
        "CcdHeader",
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=TABLE_HEADER_TEXT,
        leading=10,
    )
    header_center = ParagraphStyle(
        "CcdHeaderCenter", parent=header_style, alignment=TA_CENTER
    )

    def draw_chrome(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, pagesize[1] - 28 * mm, pagesize[0], 28 * mm, fill=1, stroke=0)
        canvas.setFillColor(BLUE_SOFT)
        canvas.rect(0, pagesize[1] - 29.2 * mm, pagesize[0], 1.4 * mm, fill=1, stroke=0)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(16 * mm, pagesize[1] - 14 * mm, "CCD-Attendance")
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(MUTED)
        canvas.drawString(
            16 * mm,
            pagesize[1] - 20 * mm,
            "Dar es Salaam Institute of Technology · RAFIC",
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=34 * mm,
        bottomMargin=16 * mm,
        title=report.get("title", "Student report"),
        author="CCD-Attendance",
    )
    story: list[Any] = []
    story.append(
        Paragraph(
            report.get("title", "Student report"),
            ParagraphStyle(
                "Cover",
                fontName="Helvetica-Bold",
                fontSize=13,
                textColor=INK,
                spaceAfter=4,
            ),
        )
    )
    student = report.get("student", {})
    summary = report.get("summary", {})
    info = [
        [
            Paragraph(f"<b>{student.get('studentName','—')}</b>", body_style),
            Paragraph(
                f"ID: {_cell_text(student.get('membershipId'))} · Reg: {_cell_text(student.get('registrationNumber'))}",
                body_style,
            ),
        ],
        [
            Paragraph(
                f"Email: {_cell_text(student.get('email'))} · Year: {_cell_text(student.get('yearOfStudy'))}",
                body_style,
            ),
            Paragraph(
                f"Present: {summary.get('daysPresent',0)} · Late: {summary.get('lateDays',0)} · Absent: {summary.get('absentDays',0)} · Rate: {summary.get('attendanceRate',0)}%",
                body_style,
            ),
        ],
    ]
    t = Table(info, colWidths=[(pagesize[0] - 28 * mm) / 2.0] * 2)
    t.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    story.append(Paragraph("Attendance % = days present (including late arrivals) / weekdays (Monday–Friday) in the report × 100.", body_style))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Day-by-day attendance", heading_style))
    header = ["Date", "Month", "Status", "Arrival", "Checkout"]
    data = [[Paragraph(f"<b>{h}</b>", header_center) for h in header]]
    for d in report.get("days", []):
        arr = d.get("arrivedAt")
        dep = d.get("checkedOutAt")
        data.append(
            [
                Paragraph(d.get("label", d.get("date", "")), cell_style),
                Paragraph(d.get("month", ""), cell_style),
                Paragraph(d.get("status", "—"), cell_center),
                Paragraph(
                    _format_time(datetime.fromisoformat(arr)) if arr else "—",
                    cell_center,
                ),
                Paragraph(
                    _format_time(datetime.fromisoformat(dep)) if dep else "—",
                    cell_center,
                ),
            ]
        )
    usable = pagesize[0] - 28 * mm
    widths = [usable * 0.24, usable * 0.26, usable * 0.16, usable * 0.17, usable * 0.17]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), TABLE_HEADER_TEXT),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.white]),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            "Legend: P = Present (arrived early), L = Late, E = Excused, — = Absent",
            body_style,
        )
    )
    doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
    return buffer.getvalue()


def render_attendance_pdf(report: dict[str, Any]) -> bytes:
    period = report["period"]
    pagesize = landscape(A3) if period in ("monthly", "custom", "all") else (landscape(A4) if period == "weekly" else A4)
    buffer = BytesIO()
    heading_style = ParagraphStyle(
        "CcdHeading",
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "CcdBody", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=11
    )
    cell_style = ParagraphStyle(
        "CcdCell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10
    )
    cell_center = ParagraphStyle(
        "CcdCellCenter", parent=cell_style, alignment=TA_CENTER
    )
    header_style = ParagraphStyle(
        "CcdHeader",
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=TABLE_HEADER_TEXT,
        leading=10,
    )
    header_center = ParagraphStyle(
        "CcdHeaderCenter", parent=header_style, alignment=TA_CENTER
    )

    def draw_chrome(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, pagesize[1] - 28 * mm, pagesize[0], 28 * mm, fill=1, stroke=0)
        canvas.setFillColor(BLUE_SOFT)
        canvas.rect(0, pagesize[1] - 29.2 * mm, pagesize[0], 1.4 * mm, fill=1, stroke=0)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(16 * mm, pagesize[1] - 14 * mm, "CCD-Attendance")
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(MUTED)
        canvas.drawString(
            16 * mm,
            pagesize[1] - 20 * mm,
            "Dar es Salaam Institute of Technology · RAFIC",
        )
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(
            pagesize[0] - 16 * mm, 10 * mm, f"Page {doc.page}  ·  Africa/Dar_es_Salaam"
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=34 * mm,
        bottomMargin=16 * mm,
        title=report["title"],
        author="CCD-Attendance",
    )
    story: list[Any] = []
    story.append(
        Paragraph(
            report["title"],
            ParagraphStyle(
                "Cover",
                fontName="Helvetica-Bold",
                fontSize=13,
                textColor=INK,
                spaceAfter=4,
            ),
        )
    )
    story.append(
        Paragraph(
            f"{report['location']}  ·  {report['startDate']} to {report['endDate']}  ·  Generated {datetime.now(settings.campus_tz).strftime('%d %b %Y, %H:%M')}",
            ParagraphStyle(
                "Sub", fontName="Helvetica", fontSize=9, textColor=MUTED, spaceAfter=10
            ),
        )
    )

    summary = report["summary"]
    stats = [
        [
            Paragraph(
                f"<b>{summary['studentsPresent']}</b><br/>Students present", cell_center
            ),
            Paragraph(
                f"<b>{summary['arrivedEarly']}</b><br/>Arrived early", cell_center
            ),
            Paragraph(f"<b>{summary['late']}</b><br/>Late", cell_center),
            Paragraph(f"<b>{summary['checkedOut']}</b><br/>Checked out", cell_center),
            Paragraph(f"<b>{summary['totalRecords']}</b><br/>Records", cell_center),
        ]
    ]
    stats_table = Table(stats, colWidths=[(pagesize[0] - 28 * mm) / 5.0] * 5)
    stats_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eaf4fb")),
                ("BOX", (0, 0), (-1, -1), 0.4, BLUE_SOFT),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(stats_table)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Attendance % = days present (including late arrivals) / weekdays (Monday–Friday) in the report × 100.", body_style))
    identity_cols = 3
    if period == "weekly":
        story.append(Paragraph("Student attendance by weekday", heading_style))
        header = ["Student", "Student ID", "Registration", *WEEKDAY_LABELS, "Days", "Attendance %"]
        table_data = [
            [
                Paragraph(
                    item, header_style if index < identity_cols else header_center
                )
                for index, item in enumerate(header)
            ]
        ]
        for student in report["students"]:
            table_data.append(
                [
                    Paragraph(student["studentName"], cell_style),
                    Paragraph(_public_student_id(student), cell_style),
                    Paragraph(_registration_number(student), cell_style),
                    *[
                        Paragraph(student["days"][label], cell_center)
                        for label in WEEKDAY_LABELS
                    ],
                    Paragraph(str(student["daysPresent"]), cell_center),
                    Paragraph(f"{student.get('attendanceRate', 0):.1f}%", cell_center),
                ]
            )
        if len(table_data) == 1:
            table_data.append(
                [
                    Paragraph(
                        "No student attendance was recorded for this week.", body_style
                    )
                ]
                + [""] * 9
            )
        usable = pagesize[0] - 28 * mm
        widths = [
            usable * 0.22,
            usable * 0.14,
            usable * 0.14,
            *[usable * 0.075] * 5,
            usable * 0.05,
            usable * 0.075,
        ]
    elif period in ("monthly", "custom", "all"):
        day_metas: list[dict[str, Any]] = report.get("days", [])  # type: ignore[assignment]
        month_groups: list[dict[str, Any]] = report.get("monthGroups", [])  # type: ignore[assignment]
        if not day_metas:
            story.append(Paragraph("Student summary", heading_style))
            header = [
                "Student",
                "Student ID",
                "Registration",
                "Days present",
                "Attendance %",
                "Late days",
            ]
            table_data = [
                [
                    Paragraph(
                        f"<b>{item}</b>",
                        header_style if index < identity_cols else header_center,
                    )
                    for index, item in enumerate(header)
                ]
            ]
            for student in report["students"]:
                table_data.append(
                    [
                        Paragraph(student["studentName"], cell_style),
                        Paragraph(_public_student_id(student), cell_style),
                        Paragraph(_registration_number(student), cell_style),
                        Paragraph(str(student["daysPresent"]), cell_center),
                        Paragraph(f"{student.get('attendanceRate', 0):.1f}%", cell_center),
                        Paragraph(str(student["lateDays"]), cell_center),
                    ]
                )
            if len(table_data) == 1:
                table_data.append(
                    [
                        Paragraph("No attendance for this period.", body_style),
                        "",
                        "",
                        "",
                        "",
                        "",
                    ]
                )
            usable = pagesize[0] - 28 * mm
            widths = [
                usable * 0.28,
                usable * 0.17,
                usable * 0.17,
                usable * 0.12,
                usable * 0.14,
                usable * 0.12,
            ]
            table = Table(table_data, colWidths=widths, repeatRows=1)
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
                        ("TEXTCOLOR", (0, 0), (-1, 0), TABLE_HEADER_TEXT),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.white]),
                        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ("LEFTPADDING", (0, 0), (-1, -1), 6),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            story.append(table)
            story.append(Spacer(1, 4 * mm))
            story.append(
                Paragraph(
                    "Legend: P = Present, L = Late, E = Excused, — = Absent", body_style
                )
            )
            doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
            return buffer.getvalue()
        story.append(
            Paragraph(
                "Student attendance by day (P = Present, L = Late, E = Excused, — = Absent)",
                heading_style,
            )
        )
        # Keep every weekday of each month in a single horizontal table.
        months: dict[str, list[dict[str, Any]]] = {}
        for day in day_metas:
            months.setdefault(day["date"][:7], []).append(day)
        small_cell = ParagraphStyle(
            "CcdSmall", parent=cell_style, fontSize=7, leading=9
        )
        small_center = ParagraphStyle(
            "CcdSmallC", parent=small_cell, alignment=TA_CENTER
        )
        small_header = ParagraphStyle(
            "CcdSmallH", parent=header_style, fontSize=7, leading=9, alignment=TA_CENTER
        )
        for month_index, chunk in enumerate(months.values()):
            if month_index:
                story.append(PageBreak())
            # Month grouping row on top of day columns
            month_row: list[Any] = [
                Paragraph("", header_style),
                Paragraph("", header_style),
            ]
            day_row: list[Any] = [
                Paragraph("<b>Student</b>", header_style),
                Paragraph("<b>ID</b>", header_style),
            ]
            # Build month spans within this chunk
            ci = 0
            while ci < len(chunk):
                m = chunk[ci]["month"]
                span = 0
                while ci + span < len(chunk) and chunk[ci + span]["month"] == m:
                    span += 1
                month_row.append(Paragraph(f"<b>{m}</b>", small_header))
                # span handled via SPAN style below; fill placeholders
                for _ in range(span - 1):
                    month_row.append(Paragraph("", small_header))
                ci += span
            for d in chunk:
                day_row.append(
                    Paragraph(f"<b>{d['dayNum']}<br/>{d['label']}</b>", small_header)
                )
            day_row.append(Paragraph("<b>Tot</b>", small_header))
            day_row.append(Paragraph("<b>Attendance %</b>", small_header))
            table_data = [month_row, day_row]
            for student in report["students"]:
                by_date = student.get("daysByDate", {}) or {}
                row_cells: list[Any] = [
                    Paragraph(student["studentName"], small_cell),
                    Paragraph(_public_student_id(student), small_cell),
                ]
                present_count = 0
                for d in chunk:
                    v = by_date.get(d["date"], "—")
                    row_cells.append(Paragraph(_short_cell(v), small_center))
                    if v in ("Present", "Late"):
                        present_count += 1
                row_cells.append(
                    Paragraph(
                        str(present_count), small_center
                    )
                )
                row_cells.append(Paragraph(f"{present_count / len(chunk) * 100:.1f}%", small_center))
                table_data.append(row_cells)
            if len(table_data) == 2:
                table_data.append(
                    [Paragraph("No attendance for this period.", body_style)]
                    + [""] * (len(chunk) + 3)
                )
            usable = pagesize[0] - 28 * mm
            name_w = usable * 0.20
            id_w = usable * 0.10
            tot_w = usable * 0.05
            rate_w = usable * 0.08
            day_w = (usable - name_w - id_w - tot_w - rate_w) / max(1, len(chunk))
            widths = [name_w, id_w, *[day_w] * len(chunk), tot_w, rate_w]
            table = Table(table_data, colWidths=widths, repeatRows=2)
            style_cmds: list[Any] = [
                ("BACKGROUND", (0, 0), (-1, 1), TABLE_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 1), TABLE_HEADER_TEXT),
                ("BACKGROUND", (0, 2), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 2), (-1, -1), [colors.white, colors.white]),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
            # Span month cells
            col = 2
            ci = 0
            while ci < len(chunk):
                m = chunk[ci]["month"]
                span = 0
                while ci + span < len(chunk) and chunk[ci + span]["month"] == m:
                    span += 1
                if span > 1:
                    style_cmds.append(("SPAN", (col, 0), (col + span - 1, 0)))
                col += span
                ci += span
            table.setStyle(TableStyle(style_cmds))
            story.append(table)
            story.append(Spacer(1, 5 * mm))
        story.append(
            Paragraph(
                "Legend: P = Present (arrived early), L = Late, E = Excused, — = Absent",
                body_style,
            )
        )
        doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
        return buffer.getvalue()
    else:
        story.append(Paragraph("Attendance register", heading_style))
        header = [
            "Student",
            "Student ID",
            "Registration",
            "Arrival",
            "Checkout",
            "Status",
            "Attendance %",
        ]
        table_data = [
            [
                Paragraph(
                    f"<b>{item}</b>",
                    header_style if index < identity_cols else header_center,
                )
                for index, item in enumerate(header)
            ]
        ]
        for row in report["rows"]:
            arrived = (
                datetime.fromisoformat(row["arrivedAt"]) if row["arrivedAt"] else None
            )
            departed = (
                datetime.fromisoformat(row["checkedOutAt"])
                if row["checkedOutAt"]
                else None
            )
            table_data.append(
                [
                    Paragraph(row["studentName"], cell_style),
                    Paragraph(_public_student_id(row), cell_style),
                    Paragraph(_registration_number(row), cell_style),
                    Paragraph(_format_time(arrived), cell_center),
                    Paragraph(_format_time(departed), cell_center),
                    Paragraph(status_label(row["status"]), cell_style),
                    Paragraph("0.0%" if row["status"] in ("ABSENT", "EXCUSED") else "100.0%", cell_center),
                ]
            )
        if len(table_data) == 1:
            table_data.append(
                [
                    Paragraph(
                        "No student attendance was recorded for this date.", body_style
                    ),
                    "",
                    "",
                    "",
                    "",
                    "",
                ]
            )
        usable = pagesize[0] - 28 * mm
        widths = [
            usable * 0.22,
            usable * 0.14,
            usable * 0.14,
            usable * 0.11,
            usable * 0.11,
            usable * 0.16,
            usable * 0.12,
        ]

    table = Table(table_data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), TABLE_HEADER_TEXT),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.white]),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
    return buffer.getvalue()
