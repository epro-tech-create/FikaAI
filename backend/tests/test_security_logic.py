import numpy as np
import pytest
import uuid
from pydantic import ValidationError
from starlette.requests import Request

from app.api.v1.auth import _client_ip, _registration_device_hash
from app.face_ai.recognition_service import cosine_similarity
from app.models.entities import Student
from app.services.location_service import haversine_meters
from app.schemas import InstructorCreateRequest, StudentRegisterRequest


def test_haversine_same_point_is_zero():
    assert haversine_meters(-6.7924, 39.2083, -6.7924, 39.2083) == pytest.approx(0, abs=0.01)


def test_haversine_rejectable_distance_is_not_radius():
    distance = haversine_meters(-6.7924, 39.2083, -6.7934, 39.2083)
    assert distance > 50


def test_cosine_similarity_normalizes_inputs():
    assert cosine_similarity(np.array([10, 0]), np.array([1, 0])) == pytest.approx(1.0)
    assert cosine_similarity(np.array([1, 0]), np.array([0, 1])) == pytest.approx(0.0)


def test_cosine_zero_vector_is_rejected_as_non_match():
    assert cosine_similarity(np.zeros(2), np.ones(2)) == 0.0


def test_student_registration_normalizes_identity_fields():
    request = StudentRegisterRequest(
        fullName="  New   Student  ",
        email="STUDENT@EXAMPLE.COM",
        registrationNumber=" 2402424123456 ",
        deviceId=uuid.UUID("12345678-1234-4234-9234-123456789abc"),
        password="SecurePass9",
    )
    assert request.full_name == "New Student"
    assert request.email == "student@example.com"
    assert request.registration_number == "2402424123456"


def test_student_registration_rejects_weak_password():
    with pytest.raises(ValidationError):
        StudentRegisterRequest(
            fullName="New Student",
            email="student@example.com",
            registrationNumber="2402424123456",
            deviceId=uuid.UUID("12345678-1234-4234-9234-123456789abc"),
            password="alllowercase",
        )


@pytest.mark.parametrize("registration_number", ["REG-2026-031", "123-456", "ABC123"])
def test_student_registration_rejects_non_numeric_numbers(registration_number):
    with pytest.raises(ValidationError):
        StudentRegisterRequest(
            fullName="New Student",
            email="student@example.com",
            registrationNumber=registration_number,
            deviceId=uuid.UUID("12345678-1234-4234-9234-123456789abc"),
            password="SecurePass9",
        )


@pytest.mark.parametrize("registration_number", ["123", "202612345", "99999999999999999999"])
def test_student_registration_accepts_any_numeric_number(registration_number):
    request = StudentRegisterRequest(
        fullName="New Student",
        email="student@example.com",
        registrationNumber=registration_number,
        deviceId=uuid.UUID("12345678-1234-4234-9234-123456789abc"),
        password="SecurePass9",
    )

    assert request.registration_number == registration_number


def test_registration_device_hash_is_stable_and_non_reversible():
    device_id = uuid.UUID("12345678-1234-4234-9234-123456789abc")

    digest = _registration_device_hash(device_id)

    assert digest == _registration_device_hash(device_id)
    assert len(digest) == 64
    assert str(device_id) not in digest


def test_registration_uses_forwarded_client_ip():
    request = Request({
        "type": "http",
        "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.2")],
        "client": ("10.0.0.3", 1234),
    })

    assert _client_ip(request) == "203.0.113.9"


def test_student_device_guard_is_a_unique_partial_index():
    index = next(index for index in Student.__table__.indexes if index.name == "uq_students_registration_device_hash")

    assert index.unique
    assert str(index.dialect_options["postgresql"]["where"]) == "registration_device_hash IS NOT NULL"


def test_instructor_creation_normalizes_identity_fields():
    request = InstructorCreateRequest(
        fullName="  New   Instructor  ",
        email="INSTRUCTOR@EXAMPLE.COM",
        password="SecurePass9",
    )
    assert request.full_name == "New Instructor"
    assert request.email == "instructor@example.com"


def test_instructor_creation_rejects_weak_password():
    with pytest.raises(ValidationError):
        InstructorCreateRequest(
            fullName="New Instructor",
            email="instructor@example.com",
            password="alllowercase",
        )
