"""Session management — added to auth router for convenience."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.chat_result import ChatResult
from app.models.audio_result import AudioResult
from app.models.video_result import VideoResult
from app.schemas.schemas import SessionResponse
from app.services.auth_service import get_current_user

router = APIRouter()


@router.post("/", response_model=SessionResponse)
async def create_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = SessionModel(user_id=current_user.id)
    db.add(session)
    await db.flush()
    return _build_session_response(session, False, False, False)


@router.get("/", response_model=List[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SessionModel)
        .where(SessionModel.user_id == current_user.id)
        .order_by(SessionModel.created_at.desc())
    )
    sessions = result.scalars().all()
    responses = []
    for s in sessions:
        chat = await db.execute(select(ChatResult).where(ChatResult.session_id == s.id))
        audio = await db.execute(select(AudioResult).where(AudioResult.session_id == s.id))
        video = await db.execute(select(VideoResult).where(VideoResult.session_id == s.id))
        responses.append(_build_session_response(
            s,
            chat.scalar_one_or_none() is not None,
            audio.scalar_one_or_none() is not None,
            video.scalar_one_or_none() is not None,
        ))
    return responses


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    chat = await db.execute(select(ChatResult).where(ChatResult.session_id == session_id))
    audio = await db.execute(select(AudioResult).where(AudioResult.session_id == session_id))
    video = await db.execute(select(VideoResult).where(VideoResult.session_id == session_id))

    return _build_session_response(
        session,
        chat.scalar_one_or_none() is not None,
        audio.scalar_one_or_none() is not None,
        video.scalar_one_or_none() is not None,
    )


def _build_session_response(session, chat_done, audio_done, video_done):
    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        status=session.status,
        created_at=session.created_at,
        chat_completed=chat_done,
        audio_completed=audio_done,
        video_completed=video_done,
    )
