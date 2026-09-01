#!/usr/bin/env python
"""Mark Monday 31 Aug 2026 attendance as arrived early (PRESENT).

Every existing Monday record becomes PRESENT with minutes_late = 0.
Check-ins at or after 11:00 move to 09:45. Earlier arrivals stay as they are.
Checkout timestamps are kept. Tuesday onward is not changed.

Dry-run by default. Apply with --apply.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, datetime, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import make_engine  # noqa: E402
from app.models.entities import AttendanceRecord, AttendanceSession, AttendanceStatus  # noqa: E402

EARLY_CHECK_IN = time(9, 0)
OFFICIAL_START = time(11, 0)


def async_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


TARGET_DATE = date(2026, 8, 31)


def campus_local(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=settings.campus_tz)
    return value.astimezone(settings.campus_tz)


def early_check_in(session_date, _current: datetime) -> datetime:
    return datetime.combine(session_date, EARLY_CHECK_IN, tzinfo=settings.campus_tz)


async def main(apply: bool) -> int:
    engine = make_engine(async_url(os.environ.get("DATABASE_URL") or settings.database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    changed = 0
    async with factory() as db:
        rows = (
            await db.execute(
                select(AttendanceRecord, AttendanceSession)
                .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
                .where(AttendanceSession.session_date == TARGET_DATE)
                .order_by(AttendanceRecord.check_in_at)
            )
        ).all()
        print(f"Monday {TARGET_DATE}: {len(rows)} attendance record(s)")
        for record, session in rows:
            new_check_in = early_check_in(session.session_date, record.check_in_at)
            new_status = AttendanceStatus.PRESENT
            if record.minutes_late == 0 and record.check_in_at == new_check_in and record.status == new_status:
                continue
            changed += 1
            print(
                f"  {session.session_date}  {record.status.value:12}  "
                f"{campus_local(record.check_in_at).strftime('%H:%M')} late={record.minutes_late}  "
                f"->  {new_status.value}  {campus_local(new_check_in).strftime('%H:%M')}"
            )
            if apply:
                session.official_start = OFFICIAL_START
                record.minutes_late = 0
                record.check_in_at = new_check_in
                record.status = new_status
        if apply:
            await db.commit()
            print(f"Updated {changed} record(s) to arrived early.")
        else:
            print(f"Dry run: {changed} record(s) would change. Re-run with --apply to write.")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write changes to the database")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.apply)))
