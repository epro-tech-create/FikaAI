#!/usr/bin/env python
"""Fill missing attendance days WITHOUT deleting existing data.

- Inserts sessions for days with no session (2026-09-02, 03, 04, 07)
- Inserts attendance_records for students missing on those days
- Sep 07 (Mon): ALL students PRESENT (per user request)
- Sep 04 (Fri): Vodacom Cybersecurity Summit — ~60% came, 40% absent (random), among present ~12% LATE
- Sep 02,03: realistic weekday distribution (~78% present incl. ~15% late among present), never deletes
- Safe to run multiple times (skips existing records)
"""
from __future__ import annotations
import asyncio, random, sys, uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select

from app.core.config import settings
from app.db.session import session_factory
from app.models.entities import (
    AttendanceRecord, AttendanceSession, AttendanceStatus, Instructor,
    PracticalLocation, RecordSource, SessionStatus, Student, VerificationMethod,
)

TARGET_DATES = [
    date(2026, 9, 2),
    date(2026, 9, 3),
    date(2026, 9, 4),
    date(2026, 9, 7),
]

SUMMIT_DATE = date(2026, 9, 4)
ALL_PRESENT_DATE = date(2026, 9, 7)

def random_checkin(status: AttendanceStatus):
    if status == AttendanceStatus.PRESENT:
        minute = random.randint(8*60+5, 9*60+29)
    else:
        minute = random.randint(9*60+30, 11*60+30)
    h, m = divmod(minute, 60)
    return minute, time(h, m, random.randint(0,59))

async def ensure_session(db, d: date, instructor: Instructor, location: PracticalLocation):
    sess = (await db.execute(select(AttendanceSession).where(AttendanceSession.session_date == d))).scalar_one_or_none()
    if sess:
        # ensure times set, do not change status from ACTIVE if it's today, else keep CLOSED
        return sess
    title = f"Daily RAFIC Attendance - {d.isoformat()}"
    if d == SUMMIT_DATE:
        title = f"Vodacom Cybersecurity Summit - {d.isoformat()} (RAFIC)"
    sess = AttendanceSession(
        instructor_id=instructor.id,
        location_id=location.id,
        title=title,
        session_date=d,
        check_in_open=time(8,0),
        official_start=time(9,30),
        check_in_close=time(15,0),
        expected_end=time(15,0),
        check_out_close=time(17,0),
        late_threshold_minutes=0,
        permitted_radius_meters=location.radius_meters,
        instructions="Auto-filled missing day (no deletion). Summit day: some attended Vodacom summit." if d==SUMMIT_DATE else "Auto-filled missing day (no deletion).",
        status=SessionStatus.CLOSED,
        is_automatic=False,
    )
    today = datetime.now(settings.campus_tz).date()
    if d == today:
        sess.status = SessionStatus.ACTIVE
    elif d > today:
        sess.status = SessionStatus.SCHEDULED
    db.add(sess)
    await db.flush()
    print(f" Created session {d} -> {sess.id} ({sess.status.value}) '{title}'")
    return sess

async def main():
    random.seed(20260909)
    async with session_factory() as db:
        instructor = (await db.execute(select(Instructor).limit(1))).scalars().first()
        if not instructor:
            print("ERROR: no instructors"); sys.exit(1)
        location = (await db.execute(select(PracticalLocation).where(PracticalLocation.name == "Dar es Salaam Cybersecurity Training Area"))).scalar_one_or_none()
        if not location:
            location = (await db.execute(select(PracticalLocation).limit(1))).scalars().first()
        students = (await db.execute(select(Student))).scalars().all()
        print(f"Students: {len(students)} | target dates {TARGET_DATES}")
        for d in TARGET_DATES:
            sess = await ensure_session(db, d, instructor, location)
            # count existing
            existing_ids = set((await db.execute(select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == sess.id))).scalars().all())
            print(f" {d}: session {sess.id} existing records {len(existing_ids)} / {len(students)} students")
            # For Sep 07 all-present, fix existing LATE -> PRESENT (per user request, no deletion)
            if d == ALL_PRESENT_DATE:
                rows = (await db.execute(select(AttendanceRecord).where(AttendanceRecord.session_id == sess.id))).scalars().all()
                fixed = 0
                for r in rows:
                    if r.status != AttendanceStatus.PRESENT:
                        # make early time 08:05-09:29
                        minute = random.randint(8*60+5, 9*60+29)
                        h,m = divmod(minute, 60)
                        t = time(h,m, random.randint(0,59))
                        r.check_in_at = datetime.combine(d, t, tzinfo=settings.campus_tz)
                        r.minutes_late = 0
                        r.status = AttendanceStatus.PRESENT
                        fixed += 1
                if fixed:
                    await db.flush()
                    print(f"  -> fixed {fixed} LATE->PRESENT for all-present {d}")

            to_create = [s for s in students if s.id not in existing_ids]
            if not to_create:
                print(f"  -> no new records needed for {d}")
                continue
            created = 0
            for student in to_create:
                # decide status per date rules
                if d == ALL_PRESENT_DATE:
                    # all present (no absent)
                    status = AttendanceStatus.PRESENT
                elif d == SUMMIT_DATE:
                    # summit: 60% present, 40% absent; among present ~12% late
                    r = random.random()
                    if r >= 0.60:
                        continue  # absent - no record (40% absent)
                    status = AttendanceStatus.LATE if random.random() < 0.12 else AttendanceStatus.PRESENT
                else:
                    # normal weekday: ~15% absent, of present ~18% late
                    r = random.random()
                    if r < 0.15:
                        continue  # absent
                    status = AttendanceStatus.LATE if r >= 0.85 else AttendanceStatus.PRESENT
                    # r 0.15-0.85 = 70% present, 0.85-1.0=15% late -> total 85% present rate

                minute, t = random_checkin(status)
                check_in_local = datetime.combine(d, t, tzinfo=settings.campus_tz)
                late_minutes = max(0, minute - (9*60+30))
                # checkout 88% have it
                check_out_at = None
                time_spent = None
                if random.random() < 0.88:
                    earliest = max(15*60, minute+45)
                    latest = 17*60
                    if earliest <= latest:
                        out_min = random.randint(earliest, latest)
                        oh, om = divmod(out_min, 60)
                        out_t = time(oh, om, random.randint(0,59))
                        out_local = datetime.combine(d, out_t, tzinfo=settings.campus_tz)
                        check_out_at = out_local
                        time_spent = int((out_local - check_in_local).total_seconds() // 60)
                rec = AttendanceRecord(
                    session_id=sess.id,
                    student_id=student.id,
                    face_enrollment_id=None,
                    check_in_at=check_in_local,
                    check_out_at=check_out_at,
                    minutes_late=late_minutes,
                    time_spent_minutes=time_spent,
                    status=status,
                    verification_method=random.choice([VerificationMethod.FACE_GPS, VerificationMethod.VENUE_GPS]),
                    source=RecordSource.ONLINE,
                    idempotency_key=uuid.uuid4(),
                )
                db.add(rec)
                created += 1
            await db.flush()
            print(f"  -> inserted {created} new records for {d} (skipped {len(students)-len(existing_ids)-created} absent)")
        await db.commit()
        # summary
        total = (await db.execute(select(AttendanceRecord))).scalars().all()
        print(f"Done (no deletions). Total records now: {len(total)}")
        # per day summary
        for d in TARGET_DATES:
            sess = (await db.execute(select(AttendanceSession).where(AttendanceSession.session_date==d))).scalar_one_or_none()
            if not sess: continue
            rows = (await db.execute(select(AttendanceRecord).where(AttendanceRecord.session_id==sess.id))).scalars().all()
            present = sum(1 for r in rows if r.status==AttendanceStatus.PRESENT)
            late = sum(1 for r in rows if r.status==AttendanceStatus.LATE)
            print(f" {d}: {len(rows)} total ({present} PRESENT, {late} LATE)")

if __name__ == "__main__":
    asyncio.run(main())
