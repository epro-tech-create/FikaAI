#!/usr/bin/env python
"""Assign CCD membership IDs (the public student ID) on the live database.

Roster source: DIT CCD membership.pdf (CCD-2026-015 … CCD-2026-085).
Matches by registration number first, then by a unique normalized name.
Also strips a CCD prefix from full_name if a previous name-prefix run was applied.

Dry-run by default. Apply with --apply after reviewing the preview.

On the VPS, after docker compose rebuild:

    docker compose --env-file .env.production -f docker-compose.prod.yml exec backend \\
      python scripts/assign_membership_ids.py
    docker compose --env-file .env.production -f docker-compose.prod.yml exec backend \\
      python scripts/assign_membership_ids.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import make_engine  # noqa: E402
from app.models.entities import Student, User, UserRole  # noqa: E402

MEMBERSHIPS: list[tuple[str, str, str]] = [
    ("CCD-2026-015", "BETTY AFRAEL NGOILALE", "240545445690"),
    ("CCD-2026-016", "Halima Shabani Juma", "250242491538"),
    ("CCD-2026-017", "Shadrack jackson", "24062381851"),
    ("CCD-2026-018", "IDDY BASHIRU RASHIDI", "240242401917"),
    ("CCD-2026-019", "JENIFA F. MSABAHA", "240242415198"),
    ("CCD-2026-020", "Eliatosha Festo", "240242422525"),
    ("CCD-2026-021", "Hamis Nurudini", "240242458313"),
    ("CCD-2026-022", "Michael Kambona", "240242459345"),
    ("CCD-2026-023", "Daniel Michael", "240242467231"),
    ("CCD-2026-024", "DEREK JOHNSON ELVIS", "250242484483"),
    ("CCD-2026-025", "Allen Byabato", "23062392791"),
    ("CCD-2026-026", "Hanston Constantine Anga", "23062307161"),
    ("CCD-2026-027", "NANCY GOSBERT", "240242448264"),
    ("CCD-2026-028", "Akram Mussa", "230627451607"),
    ("CCD-2026-029", "Mohamed yusufu Mbaga", "230242404655"),
    ("CCD-2026-030", "Lilian Focus", "240242414258"),
    ("CCD-2026-031", "Makoye kazungu", "250242474591"),
    ("CCD-2026-032", "Boniface Sylivester", "240242424497"),
    ("CCD-2026-033", "Emmanuel Haule", "24062337739"),
    ("CCD-2026-034", "Amani Bashiru Ali", "240242472751"),
    ("CCD-2026-035", "DAUD SELEMANI", "250242485225"),
    ("CCD-2026-036", "Bakari Juma Abdurabi", "240242477743"),
    ("CCD-2026-037", "Ella Essau Ng'umbi", "240242472470"),
    ("CCD-2026-038", "Alexander Mwita", "24062313441"),
    ("CCD-2026-039", "PETER JACKSON LUCASI", "240242462943"),
    ("CCD-2026-040", "Rwechungura Lutta", "250628381281"),
    ("CCD-2026-041", "EPHRAHIM LUSENGA DAVID", "240242493807"),
    ("CCD-2026-042", "Salimin Buruhani Shechonge", "240242411437"),
    ("CCD-2026-043", "Derek Kulet Lemunke", "240242495661"),
    ("CCD-2026-044", "Blair Kaboneka", "240242485001"),
    ("CCD-2026-045", "Anna Ndemfoo", "250242443836"),
    ("CCD-2026-046", "Ramla Ahmad Kilanda", "250242452746"),
    ("CCD-2026-047", "Priscus Francis Tesha", "250647472173"),
    ("CCD-2026-048", "HADIJA KILANDA", "240242475580"),
    ("CCD-2026-049", "Joshua Joseph Lams", "240627449007"),
    ("CCD-2026-050", "HAPPY CHINIKO", "240242466332"),
    ("CCD-2026-051", "Mwajibu Mohamed Roda", "240242413276"),
    ("CCD-2026-052", "Yohana Elias", "24062311445"),
    ("CCD-2026-053", "LEONE ALOYCE TESHA", "23062367215"),
    ("CCD-2026-054", "GETRUDE DEODATUS", "230242405314"),
    ("CCD-2026-055", "ATTIF MBARAK", "240229469443"),
    ("CCD-2026-056", "DEBORA DESDEUS SWAI", "240242496248"),
    ("CCD-2026-057", "DICKSON CHARLES NGASA", "250242488963"),
    ("CCD-2026-058", "MARK GAUDENCE", "240222435493"),
    ("CCD-2026-059", "WINNIEFRIDA MICHAEL MASSAWE", "240242435592"),
    ("CCD-2026-060", "NARGIS M IBRAHIM", "240242424422"),
    ("CCD-2026-061", "SAMWEL M.KITUKA", "250141452191"),
    ("CCD-2026-062", "Jowabu Kedmundi Kachakila", "230242497733"),
    ("CCD-2026-063", "OSCAR .O. MWAMKAMBA", "230229497493"),
    ("CCD-2026-064", "EBENEZER .C. NNKO", "230242471423"),
    ("CCD-2026-065", "DEUS EFRAM MASSAWE", "240242404101"),
    ("CCD-2026-066", "CLEVER PHILIMONI", "24022379533"),
    ("CCD-2026-067", "Gloria jabiri Assenga", "240242466548"),
    ("CCD-2026-068", "WAFAA GHALIB SALUM", "240242497238"),
    ("CCD-2026-069", "Winfrida Charles Frednand", "230242461200"),
    ("CCD-2026-070", "JOYCE PETER MAX", "240242471670"),
    ("CCD-2026-071", "DAUDI MUSA MLILA", "240242422800"),
    ("CCD-2026-072", "DAUDI SULEIMAN", "250229485357"),
    ("CCD-2026-073", "DANIEL WILLIAM SAMWEL", "240222436657"),
    ("CCD-2026-074", "RAYMOND FABIAN FANUEL", "240242459857"),
    ("CCD-2026-075", "JOSEPHAT RAPHAEL NKUNGUGU", "250242439131"),
    ("CCD-2026-076", "Juma Khalid Mpume", "240242423739"),
    ("CCD-2026-077", "ISDORY HERMAN MWENGU", "240242413821"),
    ("CCD-2026-078", "AUGUSTINE JOHN PAULINE", "240242474799"),
    ("CCD-2026-079", "EZEKIEL PROTAS EZEKIEL", "240141472009"),
    ("CCD-2026-080", "Bertha mbezi", "230242469344"),
    ("CCD-2026-081", "WILSON CHARLES MAZOYA", "240242459253"),
    ("CCD-2026-082", "Juma Mohamed Makumbusho", "250242425593"),
    ("CCD-2026-083", "YOHANA MARTIN NG'OMA", "240242409571"),
    ("CCD-2026-084", "Joshua Moris Sinkala", "240242403731"),
    ("CCD-2026-085", "LILIAN GUSTAFU BARTALOME", "250242429314"),
]

PREFIX = re.compile(r"^CCD-2026-\d{3}(?:\s*[·\-:]\s*|\s+)")


def async_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def normalize_name(value: str) -> str:
    stripped = PREFIX.sub("", value)
    cleaned = re.sub(r"[^a-z0-9'\s]", " ", stripped.lower())
    return " ".join(cleaned.split())


def clean_name(current_name: str) -> str:
    return PREFIX.sub("", current_name).strip() or current_name


async def main(apply: bool) -> int:
    url = async_url(os.environ.get("DATABASE_URL") or settings.database_url)

    engine = make_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async with factory() as db:
        rows = (
            await db.execute(
                select(Student, User)
                .join(User, User.id == Student.user_id)
                .where(User.role == UserRole.STUDENT)
            )
        ).all()

        by_reg = {student.registration_number: (student, user) for student, user in rows}
        by_name: dict[str, list[tuple[Student, User]]] = {}
        for student, user in rows:
            by_name.setdefault(normalize_name(user.full_name), []).append((student, user))

        updates: list[tuple[str, str, str, str, str]] = []
        missing: list[tuple[str, str, str]] = []
        already = 0

        for membership_id, roster_name, registration_number in MEMBERSHIPS:
            match = by_reg.get(registration_number)
            how = "registration"
            if match is None:
                candidates = by_name.get(normalize_name(roster_name), [])
                if len(candidates) == 1:
                    match = candidates[0]
                    how = "name"
            if match is None:
                missing.append((membership_id, roster_name, registration_number))
                continue
            student, user = match
            next_name = clean_name(user.full_name)
            already_set = student.membership_id == membership_id and user.full_name == next_name
            if already_set:
                already += 1
                continue
            updates.append((membership_id, user.full_name, next_name, user.email, how))
            if apply:
                student.membership_id = membership_id
                user.full_name = next_name

        print(f"Roster: {len(MEMBERSHIPS)}")
        print(f"Will update: {len(updates)}")
        print(f"Already tagged: {already}")
        print(f"Not in database: {len(missing)}")
        print()
        for membership_id, current, nxt, email, how in updates:
            name_note = f"  name {current!r} -> {nxt!r}" if current != nxt else ""
            print(f"  [{how}] {membership_id}  {email}{name_note}")
        if missing:
            print("\nUnmatched roster rows:")
            for membership_id, roster_name, registration_number in missing:
                print(f"  {membership_id}  {roster_name}  {registration_number}")

        if apply:
            await db.commit()
            print(f"\nApplied {len(updates)} student ID assignments.")
        else:
            print("\nDry run only. Re-run with --apply to write these changes.")

    await engine.dispose()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write membership IDs to the database")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.apply)))
