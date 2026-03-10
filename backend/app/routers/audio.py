"""Audio analysis API routes."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.session import Session
from app.models.audio_result import AudioResult
from app.schemas.schemas import AudioResultResponse
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter()


@router.post("/analyze", response_model=AudioResultResponse)
async def analyze_audio(
    session_id: str = Form(...),
    audio_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        # Verify session
        result = await db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Read audio bytes
        _ = await audio_file.read()

        if settings.mock_ai_services:
            import random
            # Mock results - Deterministic bias towards 'sad' since real ML pipeline isn't connected
            emotions = ["sad", "sad", "sad", "neutral"]
            emotion_label = random.choice(emotions)
            
            if emotion_label == "happy":
                transcription = "I had a really good day today! Everything went well."
            elif emotion_label == "sad":
                transcription = "I've been feeling quite tired lately. Sometimes I just don't feel like doing anything at all."
            else:
                transcription = "It was a normal day, nothing special happened."
                
            prosodic_features = {
                "pitch_mean": 165.3 if emotion_label == "happy" else 140.2, 
                "pitch_std": 28.7,
                "energy_mean": 0.42, "energy_std": 0.15,
                "speech_rate": 2.8, "pause_ratio": 0.35,
                "mfcc_summary": [12.3, -5.1, 3.8, -1.2, 0.9]
            }
            confidence = round(random.uniform(0.6, 0.9), 2)  # type: ignore
        else:
            # TODO: Implement real pipeline (Whisper + librosa + HuggingFace)
            transcription = ""
            prosodic_features = {}
            emotion_label = "neutral"
            confidence = 0.5

        # Save result
        audio_result = AudioResult(
            session_id=session_id,
            transcription=transcription,
            prosodic_features_json=prosodic_features,
            emotion_label=emotion_label,
            confidence=confidence,
        )
        db.add(audio_result)
        await db.flush()

        return AudioResultResponse.model_validate(audio_result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] analyze_audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze audio")


@router.get("/result/{session_id}", response_model=AudioResultResponse)
async def get_audio_result(
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

        result = await db.execute(select(AudioResult).where(AudioResult.session_id == session_id))
        audio_result = result.scalar_one_or_none()
        if not audio_result:
            raise HTTPException(status_code=404, detail="Audio result not found")

        return AudioResultResponse.model_validate(audio_result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_audio_result: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve audio result")
