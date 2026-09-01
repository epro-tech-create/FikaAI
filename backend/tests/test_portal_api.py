from datetime import date, datetime, time
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.admin import _daily_timeline
from app.core.deps import require_roles
from app.core.errors import ApiError, ErrorCode
from app.main import app
from app.schemas import SessionCreateRequest


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
    assert {"patch", "delete"} <= set(openapi_paths["/api/admin/instructors/{instructor_id}"])
    assert "/api/admin/courses" not in paths
    assert "/api/instructor/courses" not in paths
    assert "post" not in openapi_paths["/api/admin/sessions"]
    assert "post" not in openapi_paths["/api/instructor/sessions"]


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
    assert next(point for point in timeline if point["time"] == "09:30")["arrivals"] == 2
    assert next(point for point in timeline if point["time"] == "11:00")["departures"] == 1
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
