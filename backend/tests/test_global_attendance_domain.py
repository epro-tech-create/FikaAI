import inspect
from datetime import date, datetime

import pytest

from app.core.errors import ApiError, ErrorCode
from app.models.base import Base
from app.services.attendance_service import validate_minimum_checkout_time
from app.services.session_service import CampusClock, ensure_daily_presence_session, find_active_session, validate_window


def test_domain_metadata_has_no_class_or_enrollment_tables():
    assert "class_groups" not in Base.metadata.tables
    assert "student_class_enrollments" not in Base.metadata.tables


def test_session_metadata_uses_direct_course_and_instructor_references():
    table = Base.metadata.tables["attendance_sessions"]
    columns = table.columns

    assert "class_group_id" not in columns
    assert {
        "course_id",
        "instructor_id",
        "official_start",
        "expected_end",
        "check_out_close",
        "permitted_radius_meters",
        "instructions",
    } <= set(columns.keys())
    assert "fk_session_instructor_course_assignment" in {
        constraint.name for constraint in table.foreign_key_constraints
    }


def test_active_session_lookup_is_globally_eligible():
    parameters = inspect.signature(find_active_session).parameters

    assert set(parameters) == {"db", "session_id"}


@pytest.mark.asyncio
async def test_daily_session_returns_none_when_configuration_is_incomplete():
    class EmptyResult:
        def scalar_one_or_none(self):
            return None

    class EmptyDb:
        async def execute(self, _statement):
            return EmptyResult()

    assert await ensure_daily_presence_session(EmptyDb()) is None


def test_window_validation_depends_only_on_session_time():
    session = type(
        "Session",
        (),
        {
            "session_date": date(2026, 8, 25),
            "check_in_open": datetime.strptime("08:00", "%H:%M").time(),
            "check_in_close": datetime.strptime("09:00", "%H:%M").time(),
            "check_out_close": datetime.strptime("12:00", "%H:%M").time(),
        },
    )()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T08:30:00+03:00"))

    validate_window(session, "check_in", clock)
    validate_window(session, "check_out", clock)


def test_global_window_still_rejects_a_closed_check_in():
    session = type(
        "Session",
        (),
        {
            "session_date": date(2026, 8, 25),
            "check_in_open": datetime.strptime("08:00", "%H:%M").time(),
            "check_in_close": datetime.strptime("09:00", "%H:%M").time(),
            "check_out_close": datetime.strptime("12:00", "%H:%M").time(),
        },
    )()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T09:01:00+03:00"))

    with pytest.raises(ApiError) as error:
        validate_window(session, "check_in", clock)

    assert error.value.code == ErrorCode.CHECK_IN_CLOSED


def test_checkout_is_rejected_before_thirty_minutes():
    check_in_at = datetime.fromisoformat("2026-08-26T08:00:00+03:00")

    with pytest.raises(ApiError) as error:
        validate_minimum_checkout_time(
            check_in_at,
            datetime.fromisoformat("2026-08-26T08:12:00+03:00"),
        )

    assert error.value.code == ErrorCode.CHECKOUT_TOO_EARLY
    assert error.value.details["remainingMinutes"] == 18
    assert error.value.details["availableAt"] == "2026-08-26T08:30:00+03:00"


def test_checkout_is_allowed_at_thirty_minutes():
    validate_minimum_checkout_time(
        datetime.fromisoformat("2026-08-26T08:00:00+03:00"),
        datetime.fromisoformat("2026-08-26T08:30:00+03:00"),
    )
