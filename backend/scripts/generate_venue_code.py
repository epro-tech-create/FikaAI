#!/usr/bin/env python3
"""Generate a static 8-char venue code hash + QR image for RAFIC room.

Usage:
  python scripts/generate_venue_code.py --code A7K9P2X4
  python scripts/generate_venue_code.py --code A7K9P2X4 --qr --url https://attendance.cyberclubdit.org/checkin
  python scripts/generate_venue_code.py --generate   # random 8-char

Phone cameras should scan a URL QR that opens /checkin?code=XXXXXXXX
so students land on login, then auto check-in with GPS.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import secrets
import string
from urllib.parse import urlencode

CODE_RE = re.compile(r"^[A-Z0-9]{8}$")
ALPHABET = string.ascii_uppercase + string.digits
ALPHABET = ALPHABET.replace("O", "").replace("0", "").replace("I", "").replace("1", "")


def generate_random() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate static venue code hash")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--code", help="8-char alphanumeric code (uppercase)")
    g.add_argument("--generate", action="store_true", help="generate random 8-char code")
    ap.add_argument("--qr", action="store_true", help="also generate QR PNG (requires qrcode)")
    ap.add_argument(
        "--url",
        default="https://attendance.cyberclubdit.org/checkin",
        help="Base check-in URL encoded into the QR",
    )
    ap.add_argument("--out", default="venue-qr.png", help="QR output path")
    args = ap.parse_args()

    if args.generate:
        code = generate_random()
        print(f"Generated code: {code}")
    else:
        code = args.code.strip().upper()
        if not CODE_RE.fullmatch(code):
            ap.error("code must be exactly 8 alphanumeric chars (A-Z, 0-9)")

    h = hash_code(code)
    hint = f"{code[:2]}****{code[-2:]}"
    checkin_url = f"{args.url.rstrip('/')}?{urlencode({'code': code})}"
    print(f"Code: {code}")
    print(f"Hint: {hint}")
    print(f"SHA256: {h}")
    print(f"Check-in URL: {checkin_url}")
    print(f"\nAdd to .env / Render env:")
    print(f"VENUE_STATIC_CODE_HASH={h}")

    if args.qr:
        try:
            import qrcode
            img = qrcode.make(checkin_url)
            path = args.out
            img.save(path)
            print(f"QR saved to {path} (scans to URL above)")
        except ImportError:
            print("qrcode not installed: pip install qrcode[pil]")


if __name__ == "__main__":
    main()
