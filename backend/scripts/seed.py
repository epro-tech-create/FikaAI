#!/usr/bin/env python
"""Seed global students, instructors, courses, assignments, and direct sessions.

No real biometric information is created. Passwords are development-only and
are printed once when their corresponding users are created.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, update  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import session_factory  # noqa: E402
from app.models.entities import (  # noqa: E402
    AttendanceSession,
    Course,
    Instructor,
    InstructorCourseAssignment,
    LocationType,
    PracticalLocation,
    SessionStatus,
    Student,
    StudentStatus,
    User,
    UserRole,
)

SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "Student@123")
FIRST_NAMES = [
    "Amina", "Baraka", "Neema", "Juma", "Zawadi", "Tumaini", "Rehema", "Salma", "Hamisi", "Asha",
    "Peter", "Grace", "Daniel", "Esther", "Michael", "Faith", "Joseph", "Mercy", "Elias", "Joyce",
    "Frank", "Upendo", "Godfrey", "Halima", "Emmanuel", "Nuru", "Samuel", "Diana", "Isaac", "Pendo",
]
LAST_NAMES = ["Mushi", "Kimaro", "Massawe", "Nyoni", "Lyimo", "Swai", "Macha", "Kessy", "Tarimo", "Mrema"]


async def main() -> None:
    async with session_factory() as db:
        admin = (await db.execute(select(User).where(User.email == "admin@fikaai.io"))).scalar_one_or_none()
        if admin is None:
            db.add(
                User(
                    email="admin@fikaai.io",
                    password_hash=hash_password("Admin@123"),
                    full_name="System Administrator",
                    role=UserRole.ADMIN,
                )
            )
            print("Admin login: admin@fikaai.io / Admin@123")

        instructors: list[Instructor] = []
        for email, full_name in (
            ("instructor@fikaai.io", "Dr. Neema Mushi"),
            ("instructor2@fikaai.io", "Mr. Baraka Lyimo"),
        ):
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                user = User(
                    email=email,
                    password_hash=hash_password("Instructor@123"),
                    full_name=full_name,
                    role=UserRole.INSTRUCTOR,
                )
                db.add(user)
                await db.flush()
            profile = (
                await db.execute(select(Instructor).where(Instructor.user_id == user.id))
            ).scalar_one_or_none()
            if profile is None:
                profile = Instructor(user_id=user.id)
                db.add(profile)
                await db.flush()
            instructors.append(profile)
        print("Instructor login: instructor@fikaai.io / Instructor@123")

        courses: dict[str, Course] = {}
        for code, title in (
            ("CYB201", "Cybersecurity Fundamentals"),
            ("CYB220", "Network Defense Lab"),
            ("CYB310", "Ethical Hacking Practical"),
        ):
            course = (await db.execute(select(Course).where(Course.code == code))).scalar_one_or_none()
            if course is None:
                course = Course(code=code, title=title)
                db.add(course)
                await db.flush()
            course.title = title
            courses[code] = course

        for instructor in instructors:
            for course in courses.values():
                assignment = (
                    await db.execute(
                        select(InstructorCourseAssignment).where(
                            InstructorCourseAssignment.instructor_id == instructor.id,
                            InstructorCourseAssignment.course_id == course.id,
                        )
                    )
                ).scalar_one_or_none()
                if assignment is None:
                    db.add(InstructorCourseAssignment(instructor_id=instructor.id, course_id=course.id))

        location_defs = [
            (
                "Dar es Salaam Cybersecurity Training Area",
                "Dar es Salaam, Tanzania",
                settings.training_latitude,
                settings.training_longitude,
                settings.training_radius_meters,
                LocationType.CLASSROOM,
            ),
            ("East Field Station", "Outdoor training ground", -6.7950000, 39.2115000, 150, LocationType.OUTDOOR_FIELD),
            ("Cyber Range Lab", "Block A, Floor 1", -6.7910000, 39.2070000, 80, LocationType.CLASSROOM),
        ]
        locations: dict[str, PracticalLocation] = {}
        for name, address, latitude, longitude, radius, location_type in location_defs:
            location = (
                await db.execute(select(PracticalLocation).where(PracticalLocation.name == name))
            ).scalar_one_or_none()
            if location is None:
                location = PracticalLocation(name=name)
                db.add(location)
            location.address = address
            location.latitude = latitude
            location.longitude = longitude
            location.radius_meters = radius
            location.location_type = location_type
            locations[name] = location

        created_students = 0
        for i in range(30):
            registration_number = f"REG-2026-{i + 1:03d}"
            student = (
                await db.execute(
                    select(Student).where(Student.registration_number == registration_number)
                )
            ).scalar_one_or_none()
            if student is None:
                name = f"{FIRST_NAMES[i]} {LAST_NAMES[i % len(LAST_NAMES)]}"
                user = User(
                    email=f"student{i + 1:02d}@fikaai.dev",
                    password_hash=hash_password(SEED_PASSWORD),
                    full_name=name,
                    role=UserRole.STUDENT,
                )
                db.add(user)
                await db.flush()
                db.add(
                    Student(
                        user_id=user.id,
                        registration_number=registration_number,
                        course_of_study="Industrial Practical Training - Cybersecurity",
                        year_of_study=(i % 3) + 2,
                        status=StudentStatus.ACTIVE,
                    )
                )
                created_students += 1
        if created_students:
            print("Created global student accounts up to student30@fikaai.dev")
            print(f"Student password: {SEED_PASSWORD}")
        else:
            print("30 seeded global students already present")

        await db.flush()
        today = datetime.now(settings.campus_tz).date()
        active = (
            await db.execute(
                select(AttendanceSession).where(
                    AttendanceSession.status == SessionStatus.ACTIVE,
                    AttendanceSession.session_date == today,
                )
            )
        ).scalars().first()
        location = locations["Dar es Salaam Cybersecurity Training Area"]
        if active is None:
            active = AttendanceSession(
                course_id=courses["CYB201"].id,
                instructor_id=instructors[0].id,
                location_id=location.id,
                title=f"Cybersecurity Fundamentals Practical - {today.isoformat()}",
                session_date=today,
                status=SessionStatus.ACTIVE,
            )
            db.add(active)
        active.course_id = courses["CYB201"].id
        active.instructor_id = instructors[0].id
        active.location_id = location.id
        active.title = f"Cybersecurity Fundamentals Practical - {today.isoformat()}"
        active.session_date = today
        active.check_in_open = time(0, 0)
        active.official_start = time(0, 0)
        active.check_in_close = time(23, 59)
        active.expected_end = time(23, 59)
        active.check_out_close = time(23, 59)
        active.late_threshold_minutes = 24 * 60
        active.permitted_radius_meters = location.radius_meters
        active.instructions = "Complete face and location verification to record attendance."

        await db.execute(
            update(AttendanceSession)
            .where(AttendanceSession.status == SessionStatus.SCHEDULED)
            .values(status=SessionStatus.CANCELLED)
        )
        await db.commit()
        print("Seed complete: all active students are globally eligible for direct sessions.")


if __name__ == "__main__":
    asyncio.run(main())
