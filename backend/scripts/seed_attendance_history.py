#!/usr/bin/env python
"""Seed random attendance history from 2026-09-01 to today.

Creates one AttendanceSession per day (CLOSED for past, ACTIVE for today)
and random AttendanceRecord per student (PRESENT/LATE with check_in/out).

Usage:
    python scripts/seed_attendance_history.py [--from 2026-09-01] [--to 2026-09-09] [--reset]
    --reset deletes existing records/sessions in range before seeding.
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.core.config import settings
from app.db.session import session_factory
from app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatus,
    Instructor,
    PracticalLocation,
    RecordSource,
    SessionStatus,
    Student,
    VerificationMethod,
)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="from_date", default="2026-09-01", help="Start date YYYY-MM-DD")
    p.add_argument("--to", dest="to_date", default=None, help="End date YYYY-MM-DD (default today campus tz)")
    p.add_argument("--reset", action="store_true", help="Delete existing records/sessions in range")
    p.add_argument("--seed", type=int, default=42, help="Random seed")
    return p.parse_args()


async def main():
    args = parse_args()
    start = date.fromisoformat(args.from_date)
    end = date.fromisoformat(args.to_date) if args.to_date else datetime.now(settings.campus_tz).date()
    if start > end:
        print(f"ERROR: start {start} > end {end}")
        sys.exit(1)

    random.seed(args.seed)

    async with session_factory() as db:
        # fetch instructor & location
        instructor = (await db.execute(select(Instructor).limit(1))).scalars().first()
        if not instructor:
            print("ERROR: no instructors found, run seed.py first")
            sys.exit(1)
        location = (await db.execute(select(PracticalLocation).where(PracticalLocation.name == "Dar es Salaam Cybersecurity Training Area"))).scalar_one_or_none()
        if not location:
            location = (await db.execute(select(PracticalLocation).limit(1))).scalars().first()
        if not location:
            print("ERROR: no locations found, run seed.py first")
            sys.exit(1)

        students = (await db.execute(select(Student).where(Student.status == "ACTIVE"))).scalars().all()
        # fallback: all students
        if not students:
            students = (await db.execute(select(Student))).scalars().all()
        print(f"Seeding attendance for {len(students)} students from {start} to {end} (campus_tz={settings.campus_tz})")

        if args.reset:
            # delete records in range, then sessions
            # need session ids in range
            sess_ids = (await db.execute(select(AttendanceSession.id).where(AttendanceSession.session_date >= start, AttendanceSession.session_date <= end))).scalars().all()
            if sess_ids:
                await db.execute(delete(AttendanceRecord).where(AttendanceRecord.session_id.in_(sess_ids)))
                await db.execute(delete(AttendanceSession).where(AttendanceSession.id.in_(sess_ids)))
                print(f"Reset: deleted {len(sess_ids)} sessions and their records in range")
                await db.flush()

        # iterate dates
        today = datetime.now(settings.campus_tz).date()
        for i in range((end - start).days + 1):
            d = start + timedelta(days=i)
            is_today = (d == today)
            is_weekend = d.weekday() >= 5  # 5 Sat, 6 Sun
            # Weekend: lighter attendance (20% chance) or skip? We'll still create session but attendance very low
            # Ensure session exists
            sess = (await db.execute(select(AttendanceSession).where(AttendanceSession.session_date == d))).scalars().first()
            if sess is None:
                sess = AttendanceSession(
                    instructor_id=instructor.id,
                    location_id=location.id,
                    title=f"Daily RAFIC Attendance - {d.isoformat()}",
                    session_date=d,
                    check_in_open=time(8, 0),
                    official_start=time(9, 30),
                    check_in_close=time(15, 0),
                    expected_end=time(15, 0),
                    check_out_close=time(17, 0),
                    late_threshold_minutes=0,
                    permitted_radius_meters=location.radius_meters,
                    instructions="Complete face and location verification to record attendance.",
                    status=SessionStatus.ACTIVE if is_today else SessionStatus.CLOSED,
                    is_automatic=False,
                )
                db.add(sess)
                await db.flush()
            else:
                # normalize session to expected values, keep status ACTIVE for today else CLOSED
                sess.instructor_id = instructor.id
                sess.location_id = location.id
                sess.check_in_open = time(8, 0)
                sess.official_start = time(9, 30)
                sess.check_in_close = time(15, 0)
                sess.expected_end = time(15, 0)
                sess.check_out_close = time(17, 0)
                sess.permitted_radius_meters = location.radius_meters
                if is_today:
                    sess.status = SessionStatus.ACTIVE
                else:
                    if sess.status == SessionStatus.ACTIVE:
                        sess.status = SessionStatus.CLOSED
                await db.flush()

            # For each student, create random record
            for student in students:
                # skip if already has record for this session (idempotent)
                existing = (await db.execute(select(AttendanceRecord).where(AttendanceRecord.session_id == sess.id, AttendanceRecord.student_id == student.id))).scalar_one_or_none()
                if existing is not None:
                    continue

                # Weekend logic: 75% absent
                if is_weekend:
                    r = random.random()
                    if r < 0.75:
                        continue  # absent - no record
                    # else small chance present/late
                    is_late = random.random() < 0.4
                else:
                    # weekday: 15% absent, 52% PRESENT, 33% LATE (overall)
                    r = random.random()
                    if r < 0.15:
                        continue  # absent - no record
                    is_late = r >= 0.67  # 0.15-0.67 =52% present, 0.67-1=33% late

                status = AttendanceStatus.LATE if is_late else AttendanceStatus.PRESENT

                # check_in time
                if status == AttendanceStatus.PRESENT:
                    # 08:02 - 09:29
                    minute = random.randint(8 * 60 + 2, 9 * 60 + 29)
                else:
                    # 09:30 - 11:45 (late)
                    minute = random.randint(9 * 60 + 30, 11 * 60 + 45)
                h, m = divmod(minute, 60)
                check_in_local = datetime.combine(d, time(h, m, random.randint(0, 59)), tzinfo=settings.campus_tz)

                # minutes late
                late_minutes = max(0, minute - (9 * 60 + 30))

                # check_out: 88% have checkout
                check_out_at = None
                time_spent = None
                if random.random() < 0.88:
                    # checkout between 15:00-17:00, but at least 45min after checkin
                    earliest = max(15 * 60, minute + 45)
                    latest = 17 * 60
                    if earliest <= latest:
                        out_min = random.randint(earliest, latest)
                        oh, om = divmod(out_min, 60)
                        check_out_local = datetime.combine(d, time(oh, om, random.randint(0, 59)), tzinfo=settings.campus_tz)
                        check_out_at = check_out_local
                        delta = check_out_local - check_in_local
                        time_spent = int(delta.total_seconds() // 60)

                verification = random.choice([VerificationMethod.FACE_GPS, VerificationMethod.VENUE_GPS])

                rec = AttendanceRecord(
                    session_id=sess.id,
                    student_id=student.id,
                    face_enrollment_id=None,
                    check_in_at=check_in_local,
                    check_out_at=check_out_at,
                    minutes_late=late_minutes,
                    time_spent_minutes=time_spent,
                    status=status,
                    verification_method=verification,
                    source=RecordSource.ONLINE,
                    idempotency_key=uuid.uuid4(),
                )
                db.add(rec)

            await db.flush()
            # count for log
            cnt = (await db.execute(select(AttendanceRecord).where(AttendanceRecord.session_id == sess.id))).scalars().all()
            present = sum(1 for r in cnt if r.status == AttendanceStatus.PRESENT)
            late = sum(1 for r in cnt if r.status == AttendanceStatus.LATE)
            checked_out = sum(1 for r in cnt if r.check_out_at is not None)
            print(f"{d} ({sess.status.value:6s}) -> {len(cnt)} records: {present} PRESENT, {late} LATE, {checked_out} checked-out" + (" [weekend]" if is_weekend else ""))

        await db.commit()
        total = (await db.execute(select(AttendanceRecord))).scalars().all()
        print(f"Done. Total attendance_records now: {len(total)}")


if __name__ == "__main__":
    asyncio.run(main())
