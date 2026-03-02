"""Video emotion capture API routes."""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.session import Session
from app.models.video_result import VideoResult
from app.schemas.schemas import EmotionFrameRequest, VideoResultResponse
from app.services.auth_service import get_current_user

router = APIRouter()


@router.post("/emotion-frame")
async def save_emotion_frame(
    data: EmotionFrameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Receive a single emotion frame snapshot from client-side face-api.js."""
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    # Get or create video result
    result = await db.execute(select(VideoResult).where(VideoResult.session_id == data.session_id))
    video_result = result.scalar_one_or_none()

    if not video_result:
        video_result = VideoResult(
            session_id=data.session_id,
            emotion_timeline_json={"frames": []},
        )
        db.add(video_result)

    # Preserve the entire JSON structure and just add to frames
    data_json = video_result.emotion_timeline_json.copy() if hasattr(video_result.emotion_timeline_json, "copy") else dict(video_result.emotion_timeline_json)
    frames = data_json.get("frames", [])
    frames.append({
        "timestamp": data.timestamp,
        "emotions": data.emotions,
        "dominant": data.dominant_emotion,
    })
    data_json["frames"] = frames
    video_result.emotion_timeline_json = data_json
    video_result.dominant_emotion = data.dominant_emotion
    video_result.duration_seconds = int(data.timestamp)

    await db.flush()
    return {"status": "ok", "frame_count": len(frames)}


@router.post("/finalize/{session_id}", response_model=VideoResultResponse)
async def finalize_video(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Finalize video capture — compute aggregate emotions."""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(VideoResult).where(VideoResult.session_id == session_id))
    video_result = result.scalar_one_or_none()
    if not video_result:
        raise HTTPException(status_code=404, detail="No video frames recorded")

    # Compute aggregate emotion distribution
    frames = video_result.emotion_timeline_json.get("frames", [])
    if frames:
        emotion_totals = {}
        for frame in frames:
            for emotion, score in frame.get("emotions", {}).items():
                emotion_totals[emotion] = emotion_totals.get(emotion, 0) + score

        total = sum(emotion_totals.values()) or 1
        distribution = {k: round(v / total * 100, 1) for k, v in emotion_totals.items()}
        dominant = max(emotion_totals, key=emotion_totals.get)

        video_result.emotion_timeline_json = {
            "frames": frames,
            "distribution": distribution,
        }
        video_result.dominant_emotion = dominant
        await db.flush()

    return VideoResultResponse.model_validate(video_result)


@router.get("/result/{session_id}", response_model=VideoResultResponse)
async def get_video_result(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(VideoResult).where(VideoResult.session_id == session_id))
    video_result = result.scalar_one_or_none()
    if not video_result:
        raise HTTPException(status_code=404, detail="Video result not found")

    return VideoResultResponse.model_validate(video_result)
