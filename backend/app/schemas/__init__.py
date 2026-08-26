"""Pydantic schemas. Wire format is camelCase; internal field names snake_case."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True,
                              from_attributes=True, serialize_by_alias=True)


# ------------------------------------------------------------------ auth
class LoginRequest(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class StudentRegisterRequest(CamelModel):
    full_name: str = Field(min_length=3, max_length=200)
    email: str = Field(min_length=5, max_length=255)
    registration_number: str = Field(min_length=3, max_length=50)
    device_id: uuid.UUID | None = None
    password: str = Field(min_length=8, max_length=200)

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("email")
    @classmethod
    def normalize_registration_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or "." not in normalized.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("registration_number")
    @classmethod
    def normalize_registration_number(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.isdigit():
            raise ValueError("Registration number must contain numbers only.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not any(char.isupper() for char in value):
            raise ValueError("Password must contain an uppercase letter.")
        if not any(char.islower() for char in value):
            raise ValueError("Password must contain a lowercase letter.")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain a number.")
        return value


class InstructorCreateRequest(CamelModel):
    full_name: str = Field(min_length=3, max_length=200)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or "." not in normalized.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not any(char.isupper() for char in value):
            raise ValueError("Password must contain an uppercase letter.")
        if not any(char.islower() for char in value):
            raise ValueError("Password must contain a lowercase letter.")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain a number.")
        return value


class TokenPairResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    full_name: str


class RefreshRequest(CamelModel):
    refresh_token: str


class MeResponse(CamelModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str


# ------------------------------------------------------- active session
class ActiveSessionResponse(CamelModel):
    session_id: uuid.UUID
    title: str
    course_code: str
    course_title: str
    instructor_id: uuid.UUID
    instructor_name: str
    location_name: str
    location_address: str
    session_date: str
    check_in_open: str
    official_start: str
    check_in_close: str
    expected_end: str
    check_out_close: str
    late_threshold_minutes: int
    status: str
    permitted_radius_meters: float
    latitude: float
    longitude: float
    instructions: str | None = None


class NoActiveSessionResponse(CamelModel):
    message: str = "There is currently no active attendance session."


class StudentSummaryResponse(CamelModel):
    full_name: str
    registration_number: str
    status: str
    current_session_id: uuid.UUID | None = None
    course_code: str | None = None
    course_title: str | None = None
    location_name: str | None = None
    location_address: str | None = None
    permitted_radius_meters: float | None = None


# ------------------------------------------------------------ geofencing
class VerifyLocationRequest(CamelModel):
    session_id: uuid.UUID
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float = Field(ge=0, le=10_000)
    captured_at: str  # ISO-8601 with offset


class LocationVerificationResponse(CamelModel):
    verified: bool
    distance_meters: float
    allowed_radius_meters: float
    accuracy_meters: float
    message: str
    location_verification_token: str
    expires_at: datetime


# ----------------------------------------------------------------- face
class EnrollmentStatusResponse(CamelModel):
    enrolled: bool
    face_id: uuid.UUID | None = None
    enrolled_at: datetime | None = None
    sample_count: int = 0
    provider: str | None = None
    consent_given_at: datetime | None = None


class FaceEnrollmentRequest(CamelModel):
    samples: list[str] = Field(min_length=0, max_length=10)
    consent_granted: bool

    @field_validator("samples")
    @classmethod
    def non_empty_samples(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one sample is required.")
        return v


class ChallengeRequest(CamelModel):
    session_id: uuid.UUID


class ChallengeResponse(CamelModel):
    challenge_token: uuid.UUID
    challenge_type: str
    instruction: str
    expires_at: datetime


class VerifyFaceRequest(CamelModel):
    session_id: uuid.UUID
    challenge_token: str
    frames: list[str] = Field(min_length=1)

    @field_validator("frames")
    @classmethod
    def limit_frame_size(cls, v: list[str]) -> list[str]:
        # Per-frame byte ceiling enforced again after decode in the service layer
        return v


class FaceVerificationResponse(CamelModel):
    verified: bool
    face_verification_token: str | None = None
    expires_at: datetime | None = None
    message: str


# ------------------------------------------------------------ attendance
class AttendanceSubmitRequest(CamelModel):
    session_id: uuid.UUID
    location_verification_token: str
    face_verification_token: str
    idempotency_key: str


class AttendanceRecordResponse(CamelModel):
    session_id: uuid.UUID
    check_in_at: datetime
    check_out_at: datetime | None = None
    status: str
    minutes_late: int = 0
    time_spent_minutes: int | None = None
    replay: bool = False


class CurrentAttendanceResponse(CamelModel):
    has_record: bool
    record: AttendanceRecordResponse | None = None


class MessageResponse(CamelModel):
    message: str


# ----------------------------------------------------- management portals
class SessionCreateRequest(CamelModel):
    course_id: uuid.UUID
    instructor_id: uuid.UUID | None = None
    location_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    session_date: date
    check_in_open: time
    official_start: time
    check_in_close: time
    expected_end: time
    check_out_close: time
    late_threshold_minutes: int = Field(default=15, ge=0, le=1440)
    permitted_radius_meters: int = Field(gt=0)
    instructions: str | None = Field(default=None, max_length=500)
    status: str = "SCHEDULED"

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"SCHEDULED", "ACTIVE", "CLOSED", "CANCELLED"}:
            raise ValueError("Invalid session status.")
        return normalized

    @model_validator(mode="after")
    def validate_time_order(self):
        times = (
            self.check_in_open,
            self.official_start,
            self.check_in_close,
            self.expected_end,
            self.check_out_close,
        )
        if any(current > following for current, following in zip(times, times[1:])):
            raise ValueError(
                "Session times must follow check-in open, official start, check-in close, expected end, and check-out close."
            )
        return self


class SessionResponse(CamelModel):
    id: uuid.UUID
    course_id: uuid.UUID
    course_code: str
    course_title: str
    instructor_id: uuid.UUID
    instructor_name: str
    location_id: uuid.UUID
    location_name: str
    title: str
    session_date: date
    check_in_open: time
    official_start: time
    check_in_close: time
    expected_end: time
    check_out_close: time
    late_threshold_minutes: int
    permitted_radius_meters: int
    instructions: str | None
    status: str
    created_at: datetime
