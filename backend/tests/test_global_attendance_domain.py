import inspect
from datetime import date, datetime

import pytest

from app.core.errors import ApiError, ErrorCode
from app.models.base import Base
from app.models.entities import AttendanceSession
from app.services.attendance_service import validate_minimum_checkout_time
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
    monkeypatch.setattr(session_service.settings, "training_latitude", -6.8150)
    monkeypatch.setattr(session_service.settings, "training_longitude", 39.2792)
    monkeypatch.setattr(session_service.settings, "training_radius_meters", 50)
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
    assert session.check_in_open.strftime("%H:%M") == "08:00"
    assert session.official_start.strftime("%H:%M") == "09:00"
    assert session.check_in_close.strftime("%H:%M") == "11:00"
    assert session.expected_end.strftime("%H:%M") == "15:30"
    assert session.check_out_close.strftime("%H:%M") == "15:30"
    assert session.permitted_radius_meters == 50
    assert session.location.name == "DIT RAFIC Building"
    assert float(session.location.latitude) == -6.815
    assert float(session.location.longitude) == 39.2792


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


def test_checkout_is_rejected_before_three_hours():
    check_in_at = datetime.fromisoformat("2026-08-26T08:00:00+03:00")

    with pytest.raises(ApiError) as error:
        validate_minimum_checkout_time(
            check_in_at,
            datetime.fromisoformat("2026-08-26T08:12:00+03:00"),
        )

    assert error.value.code == ErrorCode.CHECKOUT_TOO_EARLY
    assert error.value.details["remainingMinutes"] == 168
    assert error.value.details["availableAt"] == "2026-08-26T11:00:00+03:00"


def test_checkout_is_allowed_at_three_hours():
    validate_minimum_checkout_time(
        datetime.fromisoformat("2026-08-26T08:00:00+03:00"),
        datetime.fromisoformat("2026-08-26T11:00:00+03:00"),
    )
