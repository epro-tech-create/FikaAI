from datetime import date, datetime, time

import pytest
from zoneinfo import ZoneInfo

from app.services.report_service import (
    _public_student_id,
    _registration_number,
    arrival_was_late,
    friday_of,
    monday_of,
    month_span,
    parse_period,
    render_attendance_pdf,
)


def test_week_bounds_are_monday_through_friday():
    wednesday = date(2026, 9, 2)
    assert monday_of(wednesday) == date(2026, 8, 31)
    assert friday_of(wednesday) == date(2026, 9, 4)
    assert monday_of(date(2026, 8, 31)) == date(2026, 8, 31)
    assert friday_of(date(2026, 9, 4)) == date(2026, 9, 4)


def test_month_span_covers_full_calendar_month():
    assert month_span(date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert month_span(date(2024, 2, 29)) == (date(2024, 2, 1), date(2024, 2, 29))


def test_parse_period_accepts_known_ranges():
    assert parse_period("weekly") == "weekly"
    with pytest.raises(ValueError):
        parse_period("yearly")


def _empty_report(period: str) -> dict:
    return {
        "period": period,
        "title": f"{period.title()} attendance",
        "date": "2026-09-01",
        "startDate": "2026-09-01",
        "endDate": "2026-09-04",
        "timezone": "Africa/Dar_es_Salaam",
        "location": "DIT RAFIC",
        "summary": {
            "totalRecords": 0,
            "studentsPresent": 0,
            "arrivedEarly": 0,
            "late": 0,
            "checkedOut": 0,
        },
        "rows": [],
        "students": [],
    }


@pytest.mark.parametrize("period", ["daily", "weekly", "monthly"])
def test_attendance_pdf_is_a_formatted_document(period: str):
    pdf = render_attendance_pdf(_empty_report(period))
    assert pdf.startswith(b"%PDF")
    assert b"CCD-Attendance" in pdf
    assert len(pdf) > 1000


def test_weekly_pdf_includes_student_weekday_matrix():
    report = _empty_report("weekly")
    report["summary"] = {
        "totalRecords": 1,
        "studentsPresent": 1,
        "arrivedEarly": 1,
        "late": 0,
        "checkedOut": 1,
    }
    report["students"] = [{
        "studentName": "Asha Kileo",
        "membershipId": "CCD-2026-016",
        "registrationNumber": "240002",
        "daysPresent": 2,
        "lateDays": 0,
        "days": {"Mon": "Present", "Tue": "Present", "Wed": "—", "Thu": "—", "Fri": "—"},
    }]
    pdf = render_attendance_pdf(report)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1500


def test_report_keeps_membership_id_and_registration_separate():
    row = {"membershipId": "CCD-2026-016", "registrationNumber": "240002"}
    assert _public_student_id(row) == "CCD-2026-016"
    assert _registration_number(row) == "240002"
    assert _public_student_id({"registrationNumber": "240002"}) == "—"
    assert _registration_number({"membershipId": "CCD-2026-016"}) == "—"


def test_arrival_counts_use_check_in_time_not_checkout_status():
    day = date(2026, 9, 1)
    official = time(11, 0)
    campus = ZoneInfo("Africa/Dar_es_Salaam")
    early = datetime(2026, 9, 1, 9, 45, tzinfo=campus)
    on_time_late = datetime(2026, 9, 1, 11, 0, tzinfo=campus)
    after_start = datetime(2026, 9, 1, 11, 20, tzinfo=campus)
    assert arrival_was_late(early, official, day) is False
    assert arrival_was_late(on_time_late, official, day) is True
    assert arrival_was_late(after_start, official, day) is True
    assert arrival_was_late(None, official, day) is False


def test_monday_31_aug_is_forced_early_in_weekly_cells():
    monday = date(2026, 8, 31)
    tuesday = date(2026, 9, 1)
    official = time(8, 0)
    campus = ZoneInfo("Africa/Dar_es_Salaam")
    late_arrival = datetime(2026, 8, 31, 12, 30, tzinfo=campus)
    tuesday_late = datetime(2026, 9, 1, 12, 30, tzinfo=campus)
    from app.services.report_service import record_was_late

    assert record_was_late("LATE", late_arrival, official, monday) is False
    assert record_was_late("LATE", tuesday_late, official, tuesday) is True
