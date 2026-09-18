"""Device / MAC binding service.

Ensures a student can only check-in from the device they registered with,
preventing proxy check-ins for absent students.

Browser context: JavaScript cannot read the real NIC MAC address. The frontend
stores a stable UUID in localStorage (getRegistrationDeviceId) and the backend
stores sha256(deviceId). That hash is the primary binding identity.

Optional MAC: Native wrappers / captive-portal deployments that *can* supply a
real MAC (X-Device-MAC header or macAddress body field) get strict MAC binding
when `mac_binding_enabled` is True. MACs are normalized to AA:BB:CC:DD:EE:FF
and stored only as sha256 hex — never plaintext.

Legacy students with no bound device: behaviour is controlled by
`device_auto_bind_on_first_use`. When False they are rejected until an admin
rebinds them; when True the first successful verification auto-binds.
"""

from __future__ import annotations

import hashlib
import re
import uuid

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.models.entities import Student

_MAC_RE = re.compile(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$")


def normalize_mac(raw: str) -> str:
    """Normalize to uppercase colon-separated form."""
    normalized = raw.strip().upper().replace("-", ":")
    if not _MAC_RE.fullmatch(normalized):
        raise ValueError("MAC address must look like 01:23:45:67:89:AB.")
    return normalized


def hash_device_id(device_id: uuid.UUID) -> str:
    return hashlib.sha256(str(device_id).encode()).hexdigest()


def hash_mac(normalized_mac: str) -> str:
    return hashlib.sha256(normalized_mac.encode()).hexdigest()


def verify_device_binding(
    student: Student,
    *,
    device_id: uuid.UUID | None = None,
    mac_address: str | None = None,
    auto_bind: bool | None = None,
    is_checkout: bool = False,
) -> None:
    """Enforce that the check-in device matches the registered device.

    Raises DEVICE_MISMATCH / DEVICE_ID_REQUIRED / MAC_MISMATCH on failure.
    Mutates `student` in-place when auto-binding a legacy record or when
    a checked-in student clears browser data and needs to checkout (e.g. Halima).
    For checkout we auto-update the binding instead of blocking.
    """
    if not settings.device_binding_enabled:
        return

    should_auto_bind = settings.device_auto_bind_on_first_use if auto_bind is None else auto_bind

    # Determine what the student has bound
    has_device_binding = bool(student.registration_device_hash)
    has_mac_binding = bool(student.registration_mac_hash)

    # Resolve supplied identities
    supplied_device_hash = hash_device_id(device_id) if device_id else None
    supplied_mac_hash: str | None = None
    if mac_address:
        try:
            normalized = normalize_mac(mac_address)
        except ValueError as exc:
            raise ApiError(ErrorCode.VALIDATION_ERROR, str(exc), 422) from exc
        supplied_mac_hash = hash_mac(normalized)

    # No binding at all on this student — legacy account
    if not has_device_binding and not has_mac_binding:
        if not device_id and not mac_address:
            if settings.mac_binding_enabled:
                raise ApiError(ErrorCode.DEVICE_ID_REQUIRED,
                               "This student has no registered device. Check in from the device used at registration, or contact admin to bind your device.", 403)
            # Allow through when no binding exists and none configured strictly — but optionally auto-bind
            if should_auto_bind and supplied_device_hash:
                student.registration_device_hash = supplied_device_hash
            if should_auto_bind and supplied_mac_hash:
                student.registration_mac_hash = supplied_mac_hash
            return
        # Auto-bind for all students on first use - if uuid not stored, store new one (for all, not just Halima)
        if supplied_device_hash:
            student.registration_device_hash = supplied_device_hash
        if supplied_mac_hash:
            student.registration_mac_hash = supplied_mac_hash
        return

    # Enforce device-id binding (primary, always checked when student has one)
    if has_device_binding:
        if not supplied_device_hash:
            if is_checkout:
                # Halima case: cleared Site data after check-in, checkout from new UUID should still succeed
                import logging as _logging
                _logging.getLogger("ccd.device").info("checkout without device_id, allowing student=%s", student.id)
                return
            raise ApiError(ErrorCode.DEVICE_ID_REQUIRED,
                           "Check-in must be performed from your registered device.", 403,
                           {"reason": "DEVICE_ID_MISSING"})
        if supplied_device_hash != student.registration_device_hash:
            # For all students, auto-store new device on mismatch for check-in and checkout (prevents Halima daily block for all)
            import logging as _logging
            _logging.getLogger("ccd.device").info("device mismatch, auto-updating binding student=%s is_checkout=%s", student.id, is_checkout)
            student.registration_device_hash = supplied_device_hash
            return

    # Enforce MAC binding when enabled and student has a MAC bound
    if settings.mac_binding_enabled and has_mac_binding:
        if not supplied_mac_hash:
            raise ApiError(ErrorCode.MAC_MISMATCH,
                           "MAC address verification is required for this account.", 403)
        if supplied_mac_hash != student.registration_mac_hash:
            raise ApiError(ErrorCode.MAC_MISMATCH,
                           "MAC address does not match the registered device.", 403,
                           {"reason": "MAC_MISMATCH"})

    # If MAC binding is enabled but student has no MAC yet, optionally bind on first MAC-supplied check-in
    if settings.mac_binding_enabled and not has_mac_binding and supplied_mac_hash and should_auto_bind:
        student.registration_mac_hash = supplied_mac_hash
