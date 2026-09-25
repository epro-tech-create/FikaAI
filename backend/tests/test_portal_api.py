from datetime import date, datetime, time
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.v1.admin import _daily_timeline
from app.core.config import settings
from app.core.deps import require_roles
from app.core.errors import ApiError, ErrorCode
from app.main import app
from app.schemas import (ManualAttendanceRequest, SessionCreateRequest,
                         SessionHoursUpdate)
from app.services.attendance_service import _campus_datetime
from pydantic import ValidationError


def test_management_portal_routes_are_mounted():
    openapi_paths = app.openapi()["paths"]
    paths = set(openapi_paths)
    assert {
        "/api/admin/dashboard",
        "/api/admin/students",
        "/api/admin/instructors",
        "/api/admin/locations",
        "/api/admin/sessions",
        "/api/admin/face-enrollments",
        "/api/admin/users",
        "/api/admin/audit-logs",
        "/api/admin/reports/summary",
        "/api/admin/reports/attendance",
        "/api/admin/reports/attendance.pdf",
        "/api/instructor/dashboard",
        "/api/instructor/sessions",
        "/api/instructor/attendance",
        "/api/instructor/reports/attendance",
        "/api/instructor/reports/attendance.pdf",
    } <= paths
    assert "post" in openapi_paths["/api/admin/instructors"]
    assert {"get", "post"} <= set(openapi_paths["/api/admin/students"])
    assert {"patch", "delete"} <= set(openapi_paths["/api/admin/students/{student_id}"])
    assert {"get", "post"} <= set(openapi_paths["/api/admin/instructors"])
    assert {"patch", "delete"} <= set(
        openapi_paths["/api/admin/instructors/{instructor_id}"]
    )
    assert "/api/admin/courses" not in paths
    assert "/api/instructor/courses" not in paths
    assert "post" not in openapi_paths["/api/admin/sessions"]
    assert "post" not in openapi_paths["/api/instructor/sessions"]
    assert "post" in openapi_paths["/api/admin/attendance/manual-check-in"]
    assert "post" in openapi_paths["/api/admin/attendance/manual-check-out"]
    assert "post" in openapi_paths["/api/instructor/attendance/manual-check-in"]
    assert "patch" in openapi_paths["/api/admin/sessions/{session_id}"]
    assert "patch" in openapi_paths["/api/instructor/sessions/{session_id}"]


def test_daily_timeline_counts_arrivals_and_departures_cumulatively():
    records = [
        SimpleNamespace(
            check_in_at=datetime.fromisoformat("2026-08-28T08:10:00+03:00"),
            check_out_at=datetime.fromisoformat("2026-08-28T11:10:00+03:00"),
        ),
        SimpleNamespace(
            check_in_at=datetime.fromisoformat("2026-08-28T09:40:00+03:00"),
            check_out_at=None,
        ),
    ]

    timeline = _daily_timeline(records)

    assert timeline[0] == {"time": "08:00", "arrivals": 1, "departures": 0}
    assert (
        next(point for point in timeline if point["time"] == "09:30")["arrivals"] == 2
    )
    assert (
        next(point for point in timeline if point["time"] == "11:00")["departures"] == 1
    )
    assert timeline[-1] == {"time": "16:00", "arrivals": 2, "departures": 1}


@pytest.mark.asyncio
async def test_admin_guard_rejects_other_roles():
    guard = require_roles("admin")
    with pytest.raises(ApiError) as error:
        await guard(user=SimpleNamespace(role=SimpleNamespace(value="instructor")))
    assert error.value.code == ErrorCode.FORBIDDEN


def test_session_payload_rejects_out_of_order_times():
    with pytest.raises(ValidationError):
        SessionCreateRequest(
            locationId=uuid4(),
            title="Practical",
            sessionDate=date(2026, 8, 25),
            checkInOpen=time(8, 0),
            officialStart=time(9, 0),
            checkInClose=time(8, 30),
            expectedEnd=time(11, 0),
            checkOutClose=time(11, 30),
            permittedRadiusMeters=50,
        )


def test_manual_attendance_accepts_naive_campus_times():
    payload = ManualAttendanceRequest.model_validate(
        {
            "studentId": str(uuid4()),
            "sessionId": str(uuid4()),
            "checkInAt": "2026-09-17T08:15:00",
            "checkOutAt": "2026-09-17T15:02:00",
            "status": "PRESENT",
        }
    )
    assert payload.check_in_at == datetime(2026, 9, 17, 8, 15)
    assert payload.check_out_at == datetime(2026, 9, 17, 15, 2)
    assert payload.check_in_at.tzinfo is None


def test_manual_attendance_rejects_checkout_before_checkin():
    with pytest.raises(ValidationError):
        ManualAttendanceRequest.model_validate(
            {
                "studentId": str(uuid4()),
                "sessionId": str(uuid4()),
                "checkInAt": "2026-09-17T15:00:00",
                "checkOutAt": "2026-09-17T08:00:00",
            }
        )


def test_campus_datetime_treats_naive_values_as_dar_es_salaam():
    aware = _campus_datetime(datetime(2026, 9, 17, 8, 15))
    assert aware.tzinfo is not None
    assert aware.utcoffset() == datetime.now(settings.campus_tz).utcoffset()
    assert aware.hour == 8
    assert aware.minute == 15


def test_session_hours_update_accepts_custom_windows():
    hours = SessionHoursUpdate.model_validate(
        {
            "checkInOpen": "07:00",
            "officialStart": "09:00",
            "checkInClose": "16:00",
            "expectedEnd": "16:00",
            "checkOutClose": "18:00",
        }
    )
    assert hours.check_in_open.hour == 7
    assert hours.check_out_close.hour == 18


def test_session_hours_update_rejects_inverted_checkin_window():
    with pytest.raises(ValidationError):
        SessionHoursUpdate.model_validate(
            {
                "checkInOpen": "15:00",
                "officialStart": "09:30",
                "checkInClose": "08:00",
                "expectedEnd": "15:00",
                "checkOutClose": "17:00",
            }
        )
