import inspect
from datetime import date, datetime

import pytest

from app.core.errors import ApiError, ErrorCode
from app.models.base import Base
from app.models.entities import AttendanceSession
from app.services import session_service
from app.services.session_service import CampusClock, find_active_session, validate_window


def test_domain_metadata_has_no_class_or_enrollment_tables():
    assert "class_groups" not in Base.metadata.tables
    assert "student_class_enrollments" not in Base.metadata.tables


def test_session_metadata_supports_course_independent_automatic_rows():
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
        "is_automatic",
    } <= set(columns.keys())
    assert columns.course_id.nullable
    assert columns.instructor_id.nullable
    assert not columns.is_automatic.nullable
    assert "fk_session_instructor_course_assignment" not in {
        constraint.name for constraint in table.foreign_key_constraints
    }
    automatic_index = next(index for index in table.indexes if index.name == "uq_attendance_sessions_automatic_date")
    assert automatic_index.unique
    assert str(automatic_index.dialect_options["postgresql"]["where"]) == "is_automatic"


def test_active_session_lookup_is_globally_eligible():
    parameters = inspect.signature(find_active_session).parameters

    assert set(parameters) == {"db", "session_id"}


@pytest.mark.asyncio
async def test_active_session_lookup_creates_fixed_daily_session(monkeypatch):
    class Result:
        def __init__(self, value=None):
            self.value = value

        def scalar_one_or_none(self):
            return self.value

    class Transaction:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class WriteDb:
        def __init__(self):
            self.added = []
            self.select_count = 0

        def begin(self):
            return Transaction()

        async def execute(self, statement, _params=None):
            if getattr(statement, "is_select", False):
                self.select_count += 1
                return Result()
            return Result()

        def add(self, value):
            self.added.append(value)

        async def flush(self):
            for value in self.added:
                if getattr(value, "id", None) is None:
                    value.id = __import__("uuid").uuid4()

    class SessionContext:
        def __init__(self, db):
            self.db = db

        async def __aenter__(self):
            return self.db

        async def __aexit__(self, *_args):
            return None

    write_db = WriteDb()
    monkeypatch.setattr(session_service, "session_factory", lambda: SessionContext(write_db))
    monkeypatch.setattr(session_service.settings, "training_latitude", -6.8137482)
    monkeypatch.setattr(session_service.settings, "training_longitude", 39.2801352)
    monkeypatch.setattr(session_service.settings, "training_radius_meters", 100)
    monkeypatch.setattr(session_service.settings, "training_location_name", "DIT RAFIC Building")
    monkeypatch.setattr(
        session_service.settings,
        "training_location_address",
        "Dar es Salaam Institute of Technology, RAFIC Building",
    )
    monkeypatch.setattr(
        session_service,
        "campus_now",
        lambda: CampusClock(datetime.fromisoformat("2026-08-25T16:00:00+03:00")),
    )

    session = await find_active_session(object())

    assert isinstance(session, AttendanceSession)
    assert session.title == "Daily RAFIC Attendance"
    assert session.session_date == date(2026, 8, 25)
    assert session.course_id is None
    assert session.instructor_id is None
    assert session.is_automatic is True
    # TESTING: whole-day window 00:00-23:59
    assert session.check_in_open.strftime("%H:%M") == "00:00"
    assert session.official_start.strftime("%H:%M") == "00:00"
    assert session.check_in_close.strftime("%H:%M") == "23:59"
    assert session.expected_end.strftime("%H:%M") == "00:00"
    assert session.check_out_close.strftime("%H:%M") == "23:59"
    assert session.permitted_radius_meters == 100
    assert session.location.name == "DIT RAFIC Building"
    assert float(session.location.latitude) == -6.8137482
    assert float(session.location.longitude) == 39.2801352


def automatic_session_window():
    return type(
        "Session",
        (),
        {
            "session_date": date(2026, 8, 25),
            "check_in_open": datetime.strptime("08:00", "%H:%M").time(),
            "check_in_close": datetime.strptime("14:00", "%H:%M").time(),
            "expected_end": datetime.strptime("14:00", "%H:%M").time(),
            "check_out_close": datetime.strptime("16:00", "%H:%M").time(),
        },
    )()


def test_check_in_and_checkout_are_allowed_at_two_pm():
    session = automatic_session_window()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T14:00:00+03:00"))

    validate_window(session, "check_in", clock)
    validate_window(session, "check_out", clock)


def test_check_in_is_rejected_after_two_pm():
    session = automatic_session_window()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T14:00:01+03:00"))

    with pytest.raises(ApiError) as error:
        validate_window(session, "check_in", clock)

    assert error.value.code == ErrorCode.CHECK_IN_CLOSED


def test_checkout_is_rejected_before_two_pm():
    session = automatic_session_window()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T13:59:59+03:00"))

    with pytest.raises(ApiError) as error:
        validate_window(session, "check_out", clock)

    assert error.value.code == ErrorCode.CHECKOUT_TOO_EARLY


def test_checkout_is_allowed_at_four_pm_boundary():
    validate_window(
        automatic_session_window(),
        "check_out",
        CampusClock(datetime.fromisoformat("2026-08-25T16:00:00+03:00")),
    )


def test_checkout_is_rejected_after_four_pm():
    session = automatic_session_window()
    clock = CampusClock(datetime.fromisoformat("2026-08-25T16:00:01+03:00"))

    with pytest.raises(ApiError) as error:
        validate_window(session, "check_out", clock)

    assert error.value.code == ErrorCode.SESSION_CLOSED


def test_window_rejects_a_different_session_date():
    session = type(
        "Session",
        (),
        {
            "session_date": date(2026, 8, 25),
            "check_in_open": datetime.strptime("08:00", "%H:%M").time(),
            "check_in_close": datetime.strptime("14:00", "%H:%M").time(),
            "expected_end": datetime.strptime("14:00", "%H:%M").time(),
            "check_out_close": datetime.strptime("12:00", "%H:%M").time(),
        },
    )()
    clock = CampusClock(datetime.fromisoformat("2026-08-26T08:30:00+03:00"))

    with pytest.raises(ApiError) as error:
        validate_window(session, "check_in", clock)

    assert error.value.code == ErrorCode.SESSION_INACTIVE
