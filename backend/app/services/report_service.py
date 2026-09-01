"""Student attendance reports: daily / weekly / monthly JSON + PDF."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from io import BytesIO
from typing import Any, Literal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import AttendanceRecord, AttendanceSession, Student, User

Period = Literal["daily", "weekly", "monthly"]
WEEKDAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri")
# One-off: 31 Aug 2026 is treated as arrived early. From 2 Sep scoring is live again.
FORCED_EARLY_DATES = frozenset({date(2026, 8, 31)})


def parse_period(value: str) -> Period:
    if value not in ("daily", "weekly", "monthly"):
        raise ValueError("Period must be daily, weekly, or monthly.")
    return value  # type: ignore[return-value]


BLUE_SOFT = colors.HexColor("#3b9cff")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
LINE = colors.HexColor("#dbe7f0")
ROW_ALT = colors.HexColor("#f3f8fc")
HEADER_BG = colors.HexColor("#0b1520")


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def friday_of(day: date) -> date:
    return monday_of(day) + timedelta(days=4)


def month_span(day: date) -> tuple[date, date]:
    last = monthrange(day.year, day.month)[1]
    return date(day.year, day.month, 1), date(day.year, day.month, last)


def status_label(status: str) -> str:
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
    """True if the student arrived at or after official start (11:00 by default)."""
    if check_in_at is None:
        return False
    local = check_in_at.astimezone(settings.campus_tz) if check_in_at.tzinfo else check_in_at.replace(tzinfo=settings.campus_tz)
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
    local = value.astimezone(settings.campus_tz) if value.tzinfo else value.replace(tzinfo=settings.campus_tz)
    return local.strftime("%H:%M")


def _human_date(day: date, *, month_year: bool = False) -> str:
    if month_year:
        return day.strftime("%B %Y")
    text = day.strftime("%d %b %Y")
    return text[1:] if text.startswith("0") else text


def _period_window(period: Period, anchor: date) -> tuple[date, date, str]:
    if period == "daily":
        return anchor, anchor, f"Daily attendance · {_human_date(anchor)}"
    if period == "weekly":
        start, end = monday_of(anchor), friday_of(anchor)
        return start, end, f"Weekly attendance · {_human_date(start)} – {_human_date(end)}"
    start, end = month_span(anchor)
    return start, end, f"Monthly attendance · {_human_date(start, month_year=True)}"


async def _records_between(db: AsyncSession, start: date, end: date) -> list[tuple[AttendanceRecord, AttendanceSession, Student, User]]:
    result = await db.execute(
        select(AttendanceRecord, AttendanceSession, Student, User)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(User, User.id == Student.user_id)
        .where(AttendanceSession.session_date >= start, AttendanceSession.session_date <= end)
        .order_by(AttendanceSession.session_date, AttendanceRecord.check_in_at, Student.registration_number)
    )
    return list(result.all())


async def weekly_attendance_series(db: AsyncSession, week_of: date) -> dict[str, Any]:
    start, end = monday_of(week_of), friday_of(week_of)
    rows = await _records_between(db, start, end)
    by_day: dict[date, list[AttendanceRecord]] = {start + timedelta(days=offset): [] for offset in range(5)}
    for record, session, _student, _user in rows:
        bucket = by_day.get(session.session_date)
        if bucket is not None:
            bucket.append(record)
    series = []
    for offset, label in enumerate(WEEKDAY_LABELS):
        day = start + timedelta(days=offset)
        day_rows = by_day[day]
        series.append({
            "day": label,
            "date": day.isoformat(),
            "arrivals": len(day_rows),
            "departures": sum(1 for item in day_rows if item.check_out_at is not None),
        })
    return {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "label": f"{_human_date(start)} – {_human_date(end)}",
        "days": series,
        "arrivals": sum(point["arrivals"] for point in series),
        "departures": sum(point["departures"] for point in series),
    }


async def build_attendance_report(db: AsyncSession, period: Period, anchor: date) -> dict[str, Any]:
    start, end, title = _period_window(period, anchor)
    packed = await _records_between(db, start, end)
    rows = []
    arrived_early = late = checked_out = 0
    students: dict[str, dict[str, Any]] = {}
    by_day: dict[str, int] = {}
    for record, session, student, user in packed:
        status = record.status.value if hasattr(record.status, "value") else str(record.status)
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
        weekday = WEEKDAY_LABELS[session.session_date.weekday()] if session.session_date.weekday() < 5 else session.session_date.strftime("%a")
        rows.append({
            "id": str(record.id),
            "day": weekday,
            "date": day_key,
            "studentName": user.full_name,
            "membershipId": student.membership_id,
            "registrationNumber": student.registration_number,
            "arrivedAt": record.check_in_at.isoformat() if record.check_in_at else None,
            "checkedOutAt": record.check_out_at.isoformat() if record.check_out_at else None,
            "status": status,
        })
        card = students.setdefault(str(student.id), {
            "studentName": user.full_name,
            "membershipId": student.membership_id,
            "registrationNumber": student.registration_number,
            "daysPresent": 0,
            "lateDays": 0,
            "days": {label: "—" for label in WEEKDAY_LABELS},
        })
        card["daysPresent"] += 1
        if was_late:
            card["lateDays"] += 1
        if session.session_date.weekday() < 5:
            card["days"][WEEKDAY_LABELS[session.session_date.weekday()]] = "Late" if was_late else "Present"

    return {
        "period": period,
        "title": title,
        "date": anchor.isoformat(),
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "timezone": settings.campus_timezone,
        "location": "DIT RAFIC",
        "summary": {
            "totalRecords": len(rows),
            "studentsPresent": len(students),
            "arrivedEarly": arrived_early,
            "late": late,
            "checkedOut": checked_out,
        },
        "dayCounts": [{"date": day, "arrivals": count} for day, count in sorted(by_day.items())],
        "rows": rows,
        "students": list(students.values()),
    }


def render_attendance_pdf(report: dict[str, Any]) -> bytes:
    period = report["period"]
    pagesize = landscape(A4) if period == "weekly" else A4
    buffer = BytesIO()
    heading_style = ParagraphStyle("CcdHeading", fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=8, spaceAfter=6)
    body_style = ParagraphStyle("CcdBody", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=11)
    cell_style = ParagraphStyle("CcdCell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10)
    cell_center = ParagraphStyle("CcdCellCenter", parent=cell_style, alignment=TA_CENTER)
    header_style = ParagraphStyle("CcdHeader", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white, leading=10)
    header_center = ParagraphStyle("CcdHeaderCenter", parent=header_style, alignment=TA_CENTER)

    def draw_chrome(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(HEADER_BG)
        canvas.rect(0, pagesize[1] - 28 * mm, pagesize[0], 28 * mm, fill=1, stroke=0)
        canvas.setFillColor(BLUE_SOFT)
        canvas.rect(0, pagesize[1] - 29.2 * mm, pagesize[0], 1.4 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(16 * mm, pagesize[1] - 14 * mm, "CCD-Attendance")
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(colors.HexColor("#9ec9ea"))
        canvas.drawString(16 * mm, pagesize[1] - 20 * mm, "Dar es Salaam Institute of Technology · RAFIC")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(pagesize[0] - 16 * mm, 10 * mm, f"Page {doc.page}  ·  Africa/Dar_es_Salaam")
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
    story.append(Paragraph(report["title"], ParagraphStyle("Cover", fontName="Helvetica-Bold", fontSize=13, textColor=INK, spaceAfter=4)))
    story.append(Paragraph(
        f"{report['location']}  ·  {report['startDate']} to {report['endDate']}  ·  Generated {datetime.now(settings.campus_tz).strftime('%d %b %Y, %H:%M')}",
        ParagraphStyle("Sub", fontName="Helvetica", fontSize=9, textColor=MUTED, spaceAfter=10),
    ))

    summary = report["summary"]
    stats = [[
        Paragraph(f"<b>{summary['studentsPresent']}</b><br/>Students present", cell_center),
        Paragraph(f"<b>{summary['arrivedEarly']}</b><br/>Arrived early", cell_center),
        Paragraph(f"<b>{summary['late']}</b><br/>Late", cell_center),
        Paragraph(f"<b>{summary['checkedOut']}</b><br/>Checked out", cell_center),
        Paragraph(f"<b>{summary['totalRecords']}</b><br/>Records", cell_center),
    ]]
    stats_table = Table(stats, colWidths=[(pagesize[0] - 28 * mm) / 5.0] * 5)
    stats_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eaf4fb")),
        ("BOX", (0, 0), (-1, -1), 0.4, BLUE_SOFT),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 8 * mm))

    identity_cols = 3
    if period == "weekly":
        story.append(Paragraph("Student attendance by weekday", heading_style))
        header = ["Student", "Student ID", "Registration", *WEEKDAY_LABELS, "Days"]
        table_data = [[Paragraph(item, header_style if index < identity_cols else header_center) for index, item in enumerate(header)]]
        for student in report["students"]:
            table_data.append([
                Paragraph(student["studentName"], cell_style),
                Paragraph(_public_student_id(student), cell_style),
                Paragraph(_registration_number(student), cell_style),
                *[Paragraph(student["days"][label], cell_center) for label in WEEKDAY_LABELS],
                Paragraph(str(student["daysPresent"]), cell_center),
            ])
        if len(table_data) == 1:
            table_data.append([Paragraph("No student attendance was recorded for this week.", body_style)] + [""] * 8)
        usable = pagesize[0] - 28 * mm
        widths = [usable * 0.22, usable * 0.14, usable * 0.14, *[usable * 0.085] * 5, usable * 0.075]
    elif period == "monthly":
        story.append(Paragraph("Student summary for the month", heading_style))
        header = ["Student", "Student ID", "Registration", "Days present", "Late days"]
        table_data = [[
            Paragraph(f"<b>{item}</b>", header_style if index < identity_cols else header_center)
            for index, item in enumerate(header)
        ]]
        for student in report["students"]:
            table_data.append([
                Paragraph(student["studentName"], cell_style),
                Paragraph(_public_student_id(student), cell_style),
                Paragraph(_registration_number(student), cell_style),
                Paragraph(str(student["daysPresent"]), cell_center),
                Paragraph(str(student["lateDays"]), cell_center),
            ])
        if len(table_data) == 1:
            table_data.append([Paragraph("No student attendance was recorded for this month.", body_style), "", "", "", ""])
        usable = pagesize[0] - 28 * mm
        widths = [usable * 0.32, usable * 0.18, usable * 0.18, usable * 0.16, usable * 0.16]
    else:
        story.append(Paragraph("Attendance register", heading_style))
        header = ["Student", "Student ID", "Registration", "Arrival", "Checkout", "Status"]
        table_data = [[
            Paragraph(f"<b>{item}</b>", header_style if index < identity_cols else header_center)
            for index, item in enumerate(header)
        ]]
        for row in report["rows"]:
            arrived = datetime.fromisoformat(row["arrivedAt"]) if row["arrivedAt"] else None
            departed = datetime.fromisoformat(row["checkedOutAt"]) if row["checkedOutAt"] else None
            table_data.append([
                Paragraph(row["studentName"], cell_style),
                Paragraph(_public_student_id(row), cell_style),
                Paragraph(_registration_number(row), cell_style),
                Paragraph(_format_time(arrived), cell_center),
                Paragraph(_format_time(departed), cell_center),
                Paragraph(status_label(row["status"]), cell_style),
            ])
        if len(table_data) == 1:
            table_data.append([Paragraph("No student attendance was recorded for this date.", body_style), "", "", "", "", ""])
        usable = pagesize[0] - 28 * mm
        widths = [usable * 0.24, usable * 0.16, usable * 0.16, usable * 0.12, usable * 0.12, usable * 0.20]

    table = Table(table_data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
    return buffer.getvalue()
