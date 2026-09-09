"""WhatsApp-like chat: conversations and messages."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import get_current_user, get_db, limiter
from app.core.errors import ApiError, ErrorCode
from app.models.entities import ChatMessage, Conversation, ConversationParticipant, ConversationType, User

router = APIRouter(prefix="/chat", tags=["chat"])


def _now():
    return datetime.now(timezone.utc)


async def _is_participant(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    r = await db.execute(select(ConversationParticipant).where(ConversationParticipant.conversation_id == conversation_id, ConversationParticipant.user_id == user_id))
    return r.scalar_one_or_none() is not None


async def _other_user_display(db: AsyncSession, conv: Conversation, me_id: uuid.UUID) -> dict | None:
    for p in conv.participants:
        if p.user_id != me_id:
            u = await db.get(User, p.user_id)
            if u:
                return {"id": str(u.id), "fullName": u.full_name, "email": u.email, "role": u.role.value}
    return None


@router.get("/conversations")
async def list_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # conversations where current user is participant
    part_rows = (await db.execute(select(ConversationParticipant).where(ConversationParticipant.user_id == user.id))).scalars().all()
    conv_ids = [p.conversation_id for p in part_rows]
    if not conv_ids:
        return []
    convs = (await db.execute(select(Conversation).where(Conversation.id.in_(conv_ids)).options(selectinload(Conversation.participants)).order_by(Conversation.updated_at.desc()))).scalars().all()
    result = []
    for conv in convs:
        # last message
        last_msg = (await db.execute(select(ChatMessage).where(ChatMessage.conversation_id == conv.id, ChatMessage.deleted_at == None).order_by(ChatMessage.created_at.desc()).limit(1))).scalar_one_or_none()
        # unread
        my_part = next((p for p in conv.participants if p.user_id == user.id), None)
        last_read = my_part.last_read_at if my_part else None
        q = select(func.count()).select_from(ChatMessage).where(ChatMessage.conversation_id == conv.id, ChatMessage.deleted_at == None, ChatMessage.sender_id != user.id)
        if last_read:
            q = q.where(ChatMessage.created_at > last_read)
        unread = (await db.execute(q)).scalar() or 0
        # title / peer
        peer = await _other_user_display(db, conv, user.id) if conv.type == ConversationType.DIRECT else None
        title = conv.title if conv.type == ConversationType.GROUP and conv.title else (peer["fullName"] if peer else "Chat")
        result.append({
            "id": str(conv.id),
            "type": conv.type.value,
            "title": title,
            "peer": peer,
            "participants": [{"userId": str(p.user_id), "lastReadAt": p.last_read_at.isoformat() if p.last_read_at else None} for p in conv.participants],
            "lastMessage": {"id": str(last_msg.id), "body": last_msg.body, "senderId": str(last_msg.sender_id), "createdAt": last_msg.created_at.isoformat()} if last_msg else None,
            "unreadCount": int(unread),
            "updatedAt": conv.updated_at.isoformat() if conv.updated_at else None,
            "createdAt": conv.created_at.isoformat() if conv.created_at else None,
        })
    return result


@router.post("/conversations")
async def create_conversation(payload: dict, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    participant_ids_raw = payload.get("participantUserIds") or payload.get("participant_ids") or payload.get("participantId") or []
    if isinstance(participant_ids_raw, str):
        participant_ids_raw = [participant_ids_raw]
    if not participant_ids_raw:
        # allow single peerId
        single = payload.get("peerId") or payload.get("userId")
        if single:
            participant_ids_raw = [single]
    if not participant_ids_raw:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "participantUserIds required", 422)
    try:
        peer_ids = [uuid.UUID(str(x)) for x in participant_ids_raw]
    except ValueError:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Invalid user id", 422)
    # include self, dedupe
    all_ids = list({user.id, *peer_ids})
    # validate users exist and active
    for uid in all_ids:
        u = await db.get(User, uid)
        if not u or not u.is_active:
            raise ApiError(ErrorCode.NOT_FOUND, f"User {uid} not found", 404)
    # For direct (2 participants) check existing
    conv_type = ConversationType.GROUP if len(all_ids) > 2 else ConversationType.DIRECT
    if conv_type == ConversationType.DIRECT:
        # find conversation with exactly these 2 participants
        # query conversations where participant count=2 and both present
        sub = select(ConversationParticipant.conversation_id).where(ConversationParticipant.user_id.in_(all_ids)).group_by(ConversationParticipant.conversation_id).having(func.count() == len(all_ids))
        candidate_ids = (await db.execute(sub)).scalars().all()
        for cid in candidate_ids:
            # ensure no extra participants
            cnt = (await db.execute(select(func.count()).select_from(ConversationParticipant).where(ConversationParticipant.conversation_id == cid))).scalar()
            if cnt == len(all_ids):
                c = await db.get(Conversation, cid)
                # ensure type direct
                if c and c.type == ConversationType.DIRECT:
                    return {"id": str(c.id), "type": c.type.value, "existing": True}

    title = payload.get("title") if conv_type == ConversationType.GROUP else None
    conv = Conversation(type=conv_type, title=title, created_by=user.id)
    db.add(conv)
    await db.flush()
    for uid in all_ids:
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=uid, last_read_at=_now() if uid == user.id else None))
    await db.flush()
    await db.commit()
    return {"id": str(conv.id), "type": conv.type.value, "title": title}


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), limit: int = Query(default=50, ge=1, le=100), before: str | None = Query(default=None), since: str | None = Query(default=None)):
    try:
        cid = uuid.UUID(conversation_id)
    except ValueError:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Invalid conversation id", 422)
    if not await _is_participant(db, cid, user.id):
        raise ApiError(ErrorCode.FORBIDDEN, "Not a participant", 403)
    q = select(ChatMessage).where(ChatMessage.conversation_id == cid, ChatMessage.deleted_at == None).order_by(ChatMessage.created_at.desc())
    if before:
        try:
            b = datetime.fromisoformat(before.replace("Z", "+00:00"))
            q = q.where(ChatMessage.created_at < b)
        except Exception:
            pass
    if since:
        try:
            s = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = select(ChatMessage).where(ChatMessage.conversation_id == cid, ChatMessage.deleted_at == None, ChatMessage.created_at > s).order_by(ChatMessage.created_at.asc())
            rows = (await db.execute(q.limit(limit))).scalars().all()
            return [{"id": str(m.id), "body": m.body, "senderId": str(m.sender_id), "senderName": m.sender.full_name if m.sender else "", "replyToId": str(m.reply_to_id) if m.reply_to_id else None, "createdAt": m.created_at.isoformat(), "editedAt": m.edited_at.isoformat() if m.edited_at else None} for m in rows]
        except Exception:
            pass
    rows = (await db.execute(q.limit(limit))).scalars().all()
    rows = list(reversed(rows))
    return [{"id": str(m.id), "body": m.body, "senderId": str(m.sender_id), "senderName": m.sender.full_name if m.sender else "", "replyToId": str(m.reply_to_id) if m.reply_to_id else None, "createdAt": m.created_at.isoformat(), "editedAt": m.edited_at.isoformat() if m.edited_at else None} for m in rows]


@router.post("/conversations/{conversation_id}/messages")
@limiter.limit("30/minute")
async def send_message(conversation_id: str, payload: dict, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        cid = uuid.UUID(conversation_id)
    except ValueError:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Invalid conversation id", 422)
    if not await _is_participant(db, cid, user.id):
        raise ApiError(ErrorCode.FORBIDDEN, "Not a participant", 403)
    body = (payload.get("body") or "").strip()
    if not body:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Message body required", 422)
    if len(body) > 2000:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Message too long (max 2000)", 422)
    reply_to = payload.get("replyToId") or payload.get("reply_to_id")
    reply_uuid = None
    if reply_to:
        try:
            reply_uuid = uuid.UUID(str(reply_to))
        except ValueError:
            reply_uuid = None
    idem = payload.get("idempotencyKey") or payload.get("idempotency_key")
    idem_uuid = None
    if idem:
        try:
            idem_uuid = uuid.UUID(str(idem))
            existing = (await db.execute(select(ChatMessage).where(ChatMessage.idempotency_key == idem_uuid))).scalar_one_or_none()
            if existing:
                return {"id": str(existing.id), "body": existing.body, "senderId": str(existing.sender_id), "createdAt": existing.created_at.isoformat(), "deduped": True}
        except ValueError:
            idem_uuid = uuid.uuid4()
    else:
        idem_uuid = uuid.uuid4()
    msg = ChatMessage(conversation_id=cid, sender_id=user.id, body=body, reply_to_id=reply_uuid, idempotency_key=idem_uuid)
    db.add(msg)
    # update conversation updated_at and sender last_read
    conv = await db.get(Conversation, cid)
    if conv:
        conv.updated_at = _now()
    part = (await db.execute(select(ConversationParticipant).where(ConversationParticipant.conversation_id == cid, ConversationParticipant.user_id == user.id))).scalar_one_or_none()
    if part:
        part.last_read_at = _now()
    await db.flush()
    await db.commit()
    return {"id": str(msg.id), "body": msg.body, "senderId": str(msg.sender_id), "createdAt": msg.created_at.isoformat()}


@router.post("/conversations/{conversation_id}/read")
async def mark_read(conversation_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        cid = uuid.UUID(conversation_id)
    except ValueError:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Invalid id", 422)
    if not await _is_participant(db, cid, user.id):
        raise ApiError(ErrorCode.FORBIDDEN, "Not a participant", 403)
    part = (await db.execute(select(ConversationParticipant).where(ConversationParticipant.conversation_id == cid, ConversationParticipant.user_id == user.id))).scalar_one_or_none()
    if part:
        part.last_read_at = _now()
        await db.commit()
    return {"ok": True}


@router.get("/users/search")
async def search_users(q: str = Query(default=""), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), limit: int = Query(default=20, ge=1, le=50)):
    # searchable: all active users except self, filter by name/email
    base = select(User).where(User.is_active == True, User.id != user.id)  # noqa: E712
    if q.strip():
        like = f"%{q.strip()}%"
        base = base.where((User.full_name.ilike(like)) | (User.email.ilike(like)))
    base = base.order_by(User.full_name).limit(limit)
    rows = (await db.execute(base)).scalars().all()
    return [{"id": str(u.id), "fullName": u.full_name, "email": u.email, "role": u.role.value} for u in rows]


@router.delete("/conversations/{conversation_id}/messages/{message_id}")
async def delete_message(conversation_id: str, message_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        cid = uuid.UUID(conversation_id)
        mid = uuid.UUID(message_id)
    except ValueError:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Invalid id", 422)
    msg = await db.get(ChatMessage, mid)
    if not msg or msg.conversation_id != cid:
        raise ApiError(ErrorCode.NOT_FOUND, "Message not found", 404)
    if msg.sender_id != user.id:
        raise ApiError(ErrorCode.FORBIDDEN, "Only sender can delete", 403)
    msg.deleted_at = _now()
    msg.body = "This message was deleted"
    await db.commit()
    return {"ok": True}
