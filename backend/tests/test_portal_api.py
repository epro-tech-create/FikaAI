from datetime import date, time
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.deps import require_roles
from app.core.errors import ApiError, ErrorCode
from app.main import app
from app.schemas import SessionCreateRequest


def test_management_portal_routes_are_mounted():
    paths = set(app.openapi()["paths"])
    assert {
        "/api/admin/dashboard",
        "/api/admin/students",
        "/api/admin/instructors",
        "/api/admin/courses",
        "/api/admin/locations",
        "/api/admin/sessions",
        "/api/admin/face-enrollments",
        "/api/admin/users",
        "/api/admin/audit-logs",
        "/api/admin/reports/summary",
        "/api/instructor/dashboard",
        "/api/instructor/courses",
        "/api/instructor/sessions",
        "/api/instructor/attendance",
        "/api/instructor/reports/attendance",
    } <= paths


@pytest.mark.asyncio
async def test_admin_guard_rejects_other_roles():
    guard = require_roles("admin")
    with pytest.raises(ApiError) as error:
        await guard(user=SimpleNamespace(role=SimpleNamespace(value="instructor")))
    assert error.value.code == ErrorCode.FORBIDDEN


def test_session_payload_rejects_out_of_order_times():
    with pytest.raises(ValidationError):
        SessionCreateRequest(
            courseId=uuid4(),
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
