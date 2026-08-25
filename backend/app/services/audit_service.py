"""Audit logging helper.

Logs contain sanitized metadata ONLY - never images, embeddings, tokens or
passwords. Failed verification attempts are recorded even when the surrounding
transaction is rolled back, using a dedicated short-lived session.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_factory
from app.models.entities import AuditLog

logger = logging.getLogger("fikaai.audit")


async def write_audit(
    db: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    entity_type: str = "",
    entity_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    return entry


async def audit_detached(
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    entity_type: str = "",
    entity_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Persist an audit entry in its own transaction (survives caller rollback)."""
    try:
        async with session_factory() as session:
            async with session.begin():
                session.add(
                    AuditLog(
                        actor_user_id=actor_user_id,
                        action=action,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        details=details or {},
                        ip_address=ip_address,
                    )
                )
    except Exception:  # noqa: BLE001 - auditing must never break the request path
        logger.exception("Failed to persist detached audit entry for action=%s", action)
