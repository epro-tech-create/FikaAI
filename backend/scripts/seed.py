#!/usr/bin/env python
"""Development seed data - NO real biometric information is created.

Creates:
    * 1 admin + 1 supervisor account (plus optional second supervisor)
    * 3 cybersecurity courses, 3 class groups, 3 permanent practical locations
    * 30 fictional students enrolled across classes
    * 1 ACTIVE session today (window widened around the current time so the
      student flow is testable at any hour) + 1 SCHEDULED session tomorrow

Passwords are printed once and read from SEED_PASSWORD (default shown below);
change them immediately outside local development.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, update  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import session_factory  # noqa: E402
from app.models.entities import (  # noqa: E402
    AttendanceSession,
    ClassGroup,
    Course,
    LocationType,
    PracticalLocation,
    SessionStatus,
    Student,
    StudentClassEnrollment,
    User,
    UserRole,
)

SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "Student@123")

FIRST_NAMES = ["Amina", "Baraka", "Neema", "Juma", "Zawadi", "Tumaini", "Rehema", "Salma", "Hamisi", "Asha",
               "Peter", "Grace", "Daniel", "Esther", "Michael", "Faith", "Joseph", "Mercy", "Elias", "Joyce",
               "Frank", "Upendo", "Godfrey", "Halima", "Emmanuel", "Nuru", "Samuel", "Diana", "Isaac", "Pendo"]
LAST_NAMES = ["Mushi", "Kimaro", "Massawe", "Nyoni", "Lyimo", "Swai", "Macha", "Kessy", "Tarimo", "Mrema"]


async def main() -> None:
    async with session_factory() as db:
        # ---- staff ----
        admin = (await db.execute(select(User).where(User.email == "admin@fikaai.io"))).scalar_one_or_none()
        if admin is None:
            db.add(User(email="admin@fikaai.io", password_hash=hash_password("Admin@123"),
                        full_name="System Administrator", role=UserRole.ADMIN))
            print("Admin login:      admin@fikaai.io / Admin@123")
        supervisor = (await db.execute(select(User).where(User.email == "supervisor@fikaai.io"))).scalar_one_or_none()
        if supervisor is None:
            db.add(User(email="supervisor@fikaai.io", password_hash=hash_password("Super@123"),
                        full_name="Dr. Neema Mushi", role=UserRole.SUPERVISOR))
            db.add(User(email="supervisor2@fikaai.io", password_hash=hash_password("Super@123"),
                        full_name="Mr. Baraka Lyimo", role=UserRole.SUPERVISOR))
            print("Supervisor login: supervisor@fikaai.io / Super@123")

        # ---- courses & classes ----
        course_defs = [
            ("CYB201", "Cybersecurity Fundamentals"),
            ("CYB220", "Network Defense Lab"),
            ("CYB310", "Ethical Hacking Practical"),
        ]
        legacy_codes = {"CYB201": "DBS201", "CYB220": "DSA210", "CYB310": "NET305"}
        courses = {}
        for code, title in course_defs:
            row = (await db.execute(select(Course).where(Course.code == code))).scalar_one_or_none()
            if row is None:
                row = (await db.execute(select(Course).where(Course.code == legacy_codes[code]))).scalar_one_or_none()
                if row is not None:
                    row.code = code
            if row is None:
                row = Course(code=code, title=title)
                db.add(row)
                await db.flush()
            row.title = title
            courses[code] = row

        classes = {}
        class_defs = [("CYB201", "CS-Y2-A"), ("CYB220", "CS-Y2-B"), ("CYB310", "CS-Y3-A")]
        for code, name in class_defs:
            row = (await db.execute(
                select(ClassGroup).where(ClassGroup.course_id == courses[code].id, ClassGroup.name == name)
            )).scalar_one_or_none()
            if row is None:
                row = ClassGroup(course_id=courses[code].id, name=name)
                db.add(row)
                await db.flush()
            classes[name] = row

        # ---- practical locations (fictional coordinates) ----
        location_defs = [
            # Development city-wide Dar es Salaam geofence. Override with TRAINING_* in production.
            ("Dar es Salaam Cybersecurity Training Area", "Dar es Salaam, Tanzania", settings.training_latitude, settings.training_longitude, settings.training_radius_meters, LocationType.CLASSROOM),
            ("East Field Station", "Outdoor training ground", -6.7950000, 39.2115000, 150, LocationType.OUTDOOR_FIELD),
            ("Cyber Range Lab", "Block A, Floor 1", -6.7910000, 39.2070000, 80, LocationType.CLASSROOM),
        ]
        legacy_locations = {
            "Dar es Salaam Cybersecurity Training Area": "Mbezi Cybersecurity Training Area",
            "Cyber Range Lab": "Lecture Hall 2",
        }
        locations = {}
        for name, address, lat, lon, radius, ltype in location_defs:
            row = (await db.execute(select(PracticalLocation).where(PracticalLocation.name == name))).scalar_one_or_none()
            if row is None and name in legacy_locations:
                row = (await db.execute(
                    select(PracticalLocation).where(PracticalLocation.name == legacy_locations[name])
                )).scalar_one_or_none()
                if row is not None:
                    row.name = name
            if row is None:
                row = PracticalLocation(name=name, address=address, latitude=lat, longitude=lon,
                                        radius_meters=radius, location_type=ltype)
                db.add(row)
                await db.flush()
            else:
                # Keep seeded development data aligned with the named campus.
                row.address = address
                row.latitude = lat
                row.longitude = lon
                row.radius_meters = radius
                row.location_type = ltype
            locations[name] = row

        # Permanent room mapping inherited by every student in the class.
        classes["CS-Y2-A"].default_location_id = locations["Dar es Salaam Cybersecurity Training Area"].id
        classes["CS-Y2-B"].default_location_id = locations["Cyber Range Lab"].id
        classes["CS-Y3-A"].default_location_id = locations["East Field Station"].id

        # ---- students ----
        existing_students = (await db.execute(select(Student))).scalars().all()
        if len(existing_students) >= 30:
            print(f"{len(existing_students)} students already present - skipping creation")
            students = existing_students
        else:
            students = []
            for i in range(30):
                name = f"{FIRST_NAMES[i % len(FIRST_NAMES)]} {LAST_NAMES[i % len(LAST_NAMES)]}"
                email = f"student{i + 1:02d}@fikaai.dev"
                user = User(email=email, password_hash=hash_password(SEED_PASSWORD), full_name=name,
                            role=UserRole.STUDENT)
                db.add(user)
                await db.flush()
                student = Student(user_id=user.id, registration_number=f"REG-{2026}-{i + 1:03d}",
                                  course_of_study="Industrial Practical Training - Cybersecurity",
                                  year_of_study=(i % 3) + 2)
                db.add(student)
                await db.flush()
                # Enroll into classes round-robin
                target_class = [classes["CS-Y2-A"], classes["CS-Y2-A"], classes["CS-Y2-B"],
                                classes["CS-Y3-A"]][i % 4]
                db.add(StudentClassEnrollment(student_id=student.id, class_group_id=target_class.id))
                students.append(student)
            print(f"Created 30 students (login pattern: student01@fikaai.dev .. student30@fikaai.dev)")
            print(f"Student password : {SEED_PASSWORD}")

        await db.flush()

        # ---- sessions ----
        today = datetime.now(settings.campus_tz).date()
        active = (await db.execute(
            select(AttendanceSession).where(
                AttendanceSession.status == SessionStatus.ACTIVE,
                AttendanceSession.session_date == today,
            )
        )).scalars().first()

        open_t = time(0, 0)
        close_t = time(23, 59)
        if active is None:
            active = AttendanceSession(
                class_group_id=classes["CS-Y2-A"].id,
                location_id=locations["Dar es Salaam Cybersecurity Training Area"].id,
                title=f"Cybersecurity Fundamentals Practical - {today.isoformat()}",
                session_date=today,
                late_threshold_minutes=settings.default_late_threshold_minutes,
                status=SessionStatus.ACTIVE,
            )
            db.add(active)
        # Re-running seed reopens today's demo session for another test window.
        active.class_group_id = classes["CS-Y2-A"].id
        active.location_id = locations["Dar es Salaam Cybersecurity Training Area"].id
        active.title = f"Cybersecurity Fundamentals Practical - {today.isoformat()}"
        active.session_date = today
        active.check_in_open = open_t
        active.check_in_close = close_t
        active.expected_end = time(23, 59)
        active.late_threshold_minutes = 24 * 60
        print(f"Daily presence ready for CS-Y2-A @ Dar es Salaam Cybersecurity Training Area "
              f"(radius {locations['Dar es Salaam Cybersecurity Training Area'].radius_meters} m)")

        # Scheduled sessions are no longer used by the student flow.
        await db.execute(update(AttendanceSession).where(AttendanceSession.status == SessionStatus.SCHEDULED).values(status=SessionStatus.CANCELLED))

        await db.commit()
        print("\nSeed complete.")


if __name__ == "__main__":
    asyncio.run(main())
