import numpy as np
import pytest
from pydantic import ValidationError

from app.face_ai.recognition_service import cosine_similarity
from app.services.location_service import haversine_meters
from app.schemas import StudentRegisterRequest


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
        registrationNumber="reg-2026-031",
        password="SecurePass9",
    )
    assert request.full_name == "New Student"
    assert request.email == "student@example.com"
    assert request.registration_number == "REG-2026-031"


def test_student_registration_rejects_weak_password():
    with pytest.raises(ValidationError):
        StudentRegisterRequest(
            fullName="New Student",
            email="student@example.com",
            registrationNumber="REG-2026-031",
            password="alllowercase",
        )
