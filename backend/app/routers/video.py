"""Video emotion capture API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

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
    try:
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
            await db.flush()  # Ensure it's persisted before modifying

        # CRITICAL: Create a NEW dict object so SQLAlchemy detects the change.
        # In-place mutations to JSON columns are NOT detected by SQLAlchemy.
        old_json = video_result.emotion_timeline_json or {"frames": []}
        frames = list(old_json.get("frames", []))
        frames.append({
            "timestamp": data.timestamp,
            "emotions": data.emotions,
            "dominant": data.dominant_emotion,
        })

        # Assign a completely new dict (not a mutation)
        video_result.emotion_timeline_json = {
            "frames": frames,
        }
        video_result.dominant_emotion = data.dominant_emotion
        video_result.duration_seconds = int(data.timestamp)

        # Belt-and-suspenders: explicitly flag the JSON column as modified
        flag_modified(video_result, "emotion_timeline_json")

        await db.flush()
        return {"status": "ok", "frame_count": len(frames)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] save_emotion_frame: {e}")
        raise HTTPException(status_code=500, detail="Failed to save emotion frame")


@router.post("/finalize/{session_id}", response_model=VideoResultResponse)
async def finalize_video(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Finalize video capture — compute aggregate emotions."""
    try:
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
        frames = (video_result.emotion_timeline_json or {}).get("frames", [])
        print(f"[DEBUG] finalize_video: session={session_id}, frame_count={len(frames)}")

        if frames:
            emotion_totals = {}
            for frame in frames:
                for emotion, score in frame.get("emotions", {}).items():
                    emotion_totals[emotion] = emotion_totals.get(emotion, 0) + score

            total = sum(emotion_totals.values()) or 1
            distribution = {k: round(v / total * 100, 1) for k, v in emotion_totals.items()}
            dominant = max(emotion_totals, key=emotion_totals.get)

            # CRITICAL: Assign a NEW dict — do NOT mutate in place
            video_result.emotion_timeline_json = {
                "frames": frames,
                "distribution": distribution,
            }
            video_result.dominant_emotion = dominant
            flag_modified(video_result, "emotion_timeline_json")
            await db.flush()

            print(f"[DEBUG] finalize_video: distribution={distribution}, dominant={dominant}")
        else:
            print(f"[WARN] finalize_video: No frames found for session {session_id}")

        return VideoResultResponse.model_validate(video_result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] finalize_video: {e}")
        raise HTTPException(status_code=500, detail="Failed to finalize video analysis")


@router.get("/result/{session_id}", response_model=VideoResultResponse)
async def get_video_result(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_video_result: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve video result")
