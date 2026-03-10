"""Report generation and download API routes with PDF support."""
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.session import Session
from app.models.chat_result import ChatResult
from app.models.audio_result import AudioResult
from app.models.video_result import VideoResult
from app.models.analysis_report import AnalysisReport
from app.schemas.schemas import ReportGenerateRequest, ReportResponse
from app.services.auth_service import get_current_user
from app.config import settings
from typing import List

router = APIRouter()


@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    data: ReportGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        # Verify session
        result = await db.execute(
            select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Delete any existing report so re-generation always uses fresh data
        # (Fixes issue where video analysis added after first report was ignored)
        existing = await db.execute(
            select(AnalysisReport).where(AnalysisReport.session_id == data.session_id)
        )
        existing_report = existing.scalars().first()
        if existing_report:
            await db.delete(existing_report)
            await db.flush()

        # Gather all modality data
        chat = await db.execute(select(ChatResult).where(ChatResult.session_id == data.session_id).order_by(ChatResult.created_at.desc()))
        chat_result = chat.scalars().first()

        audio = await db.execute(select(AudioResult).where(AudioResult.session_id == data.session_id).order_by(AudioResult.created_at.desc()))
        audio_result = audio.scalars().first()

        video = await db.execute(select(VideoResult).where(VideoResult.session_id == data.session_id).order_by(VideoResult.created_at.desc()))
        video_result = video.scalars().first()

        # Debug logging
        print(f"[DEBUG] Report generation for session {data.session_id}")
        print(f"  chat_result: {'YES' if chat_result else 'NO'}")
        print(f"  audio_result: {'YES' if audio_result else 'NO'} - emotion: {audio_result.emotion_label if audio_result else 'N/A'}")
        if video_result:
            vj = video_result.emotion_timeline_json or {}
            frame_count = len(vj.get("frames", []))
            dist = vj.get("distribution", {})
            print(f"  video_result: YES - frames={frame_count}, distribution={dist}, dominant={video_result.dominant_emotion}")
        else:
            print(f"  video_result: NO")

        # Build dynamic report based on actual data
        chat_sentiment = chat_result.sentiment_scores if chat_result else {}
        chat_phq9 = chat_result.phq9_signals if chat_result else {}

        # Compute text risk from actual sentiment
        text_risk = 0.5
        if chat_sentiment:
            neg = chat_sentiment.get("negative", 0)
            text_risk = round(min(neg * 1.5, 0.95), 2)

        # Compute PHQ9 risk contribution
        phq9_avg = 0
        if chat_phq9:
            vals = [v for v in chat_phq9.values() if isinstance(v, (int, float))]
            phq9_avg = sum(vals) / max(len(vals), 1)

        text_fusion = max(text_risk, phq9_avg)

        # Compute audio risk
        audio_risk = 0.0
        audio_emotion = "None"
        if audio_result:
            audio_emotion = audio_result.emotion_label
            if audio_emotion == "sad":
                audio_risk = 0.8
            elif audio_emotion == "neutral":
                audio_risk = 0.4
            else:
                audio_risk = 0.2

        # Compute video risk
        video_risk = 0.0
        video_dist = {}
        if video_result:
            video_json = video_result.emotion_timeline_json or {}
            video_dist = video_json.get("distribution", {})

            # If no distribution was computed, compute it now from frames
            if not video_dist:
                frames = video_json.get("frames", [])
                if frames:
                    emotion_totals = {}
                    for frame in frames:
                        for emotion, score in frame.get("emotions", {}).items():
                            emotion_totals[emotion] = emotion_totals.get(emotion, 0) + score
                    total = sum(emotion_totals.values()) or 1
                    video_dist = {k: round(v / total * 100, 1) for k, v in emotion_totals.items()}
                    print(f"  [INFO] Computed distribution from {len(frames)} frames: {video_dist}")

            sad_pct = video_dist.get("sad", 0) / 100.0
            fear_pct = video_dist.get("fearful", 0) / 100.0
            angry_pct = video_dist.get("angry", 0) / 100.0
            video_risk = min((sad_pct * 4.0) + (fear_pct * 3.0) + (angry_pct * 2.5), 0.95)
            if (sad_pct + fear_pct + angry_pct) > 0.02:
                video_risk = max(video_risk, 0.4)

        print(f"  text_risk={text_fusion:.2f}, audio_risk={audio_risk:.2f}, video_risk={video_risk:.2f}")

        # Determine overall risk using weighted average of available modalities
        weights = []
        scores = []
        if chat_result:
            weights.append(0.4)
            scores.append(text_fusion)
        if audio_result:
            weights.append(0.3)
            scores.append(audio_risk)
        if video_result:
            weights.append(0.3)
            scores.append(video_risk)
            
        if weights:
            weighted_avg = sum(w * s for w, s in zip(weights, scores)) / sum(weights)
            max_score = max(scores)
            # 70% weight to the highest risk found, 30% to the overall average
            fusion_score = round((max_score * 0.7) + (weighted_avg * 0.3), 2)
        else:
            fusion_score = round(max(text_fusion, 0.15), 2)

        if fusion_score >= 0.7:
            risk_level = "High"
        elif fusion_score >= 0.4:
            risk_level = "Moderate"
        else:
            risk_level = "Low"

        print(f"  fusion_score={fusion_score}, risk_level={risk_level}")

        # Build text summary from actual chat data
        text_summary = "Conversation analysis not available."
        if chat_sentiment:
            neg_pct = round(chat_sentiment.get("negative", 0) * 100)
            pos_pct = round(chat_sentiment.get("positive", 0) * 100)
            text_summary = f"Conversation reveals {neg_pct}% negative and {pos_pct}% positive sentiment."
            if chat_phq9:
                high_signals = [k for k, v in chat_phq9.items() if isinstance(v, (int, float)) and v > 0.2]
                if high_signals:
                    text_summary += f" Notable indicators: {', '.join(high_signals).replace('_', ' ')}."

        # Build context for the AI
        prompt = f"""You are MindScan, an expert multimodal psychiatric AI assistant. Analyze the following patient data to detect depressive symptoms and generate a comprehensive risk report.
    
    PATIENT DATA:
    Text Analysis: Sentiment scores: {chat_sentiment}, PHQ9 Signals: {chat_phq9}, Text Risk: {text_fusion:.2f}
    Audio Analysis: Emotion: {audio_emotion}, Risk: {audio_risk:.2f}
    Video Analysis: Emotion Distribution: {video_dist}, Risk: {video_risk:.2f}, Dominant: {video_result.dominant_emotion if video_result else 'N/A'}
    Base Calculated Fusion Score: {fusion_score}
    Base Calculated Risk Level: {risk_level}

    IMPORTANT INSTRUCTIONS:
    1. Your recommendations MUST be specific and personalized based on the ACTUAL detected signals, NOT generic.
    2. If the video shows sadness/fear/anger, address those specific facial expression patterns.
    3. If PHQ-9 signals are detected (hopelessness, fatigue, sleep issues, etc.), address each one specifically.
    4. If audio shows sad emotion, mention voice pattern concerns.
    5. Provide at least 6 specific, actionable recommendations tailored to the patient's specific indicators.

    Format your response STRICTLY as valid JSON matching this exact structure, with NO markdown formatting or other text wrappers:
    {{
        "summary": "High-level professional summary of the patient's depressive indicators, specifically mentioning detected issues from ALL modalities.",
        "per_modality": {{
            "text": {{"summary": "Detailed analysis of text chat including specific PHQ-9 signals detected", "risk_contribution": <float 0.0-1.0>}},
            "audio": {{"summary": "Detailed analysis of audio/voice patterns (or state 'Not available/completed')", "risk_contribution": <float 0.0-1.0>}},
            "video": {{"summary": "Detailed analysis of facial expression patterns with specific emotions detected (or state 'Not available/completed')", "risk_contribution": <float 0.0-1.0>}}
        }},
        "fusion_score": <float 0.0-1.0>,
        "risk_level": "Low" | "Moderate" | "High",
        "explainability": {{
            "text_weight": 40, "audio_weight": 30, "video_weight": 30,
            "key_factors": ["specific risk factor 1 from actual data", "specific risk factor 2", "specific risk factor 3"],
            "confidence": <float 0.0-1.0>
        }},
        "lifetime_risk_projection": {{
            "current": <float>, "6_months": <float>, "1_year": <float>, "notes": "Specific projection notes based on detected patterns"
        }},
        "remedies": ["specific recommendation 1 addressing detected issue", "specific recommendation 2", "specific recommendation 3", "specific recommendation 4", "specific recommendation 5", "specific recommendation 6"],
        "disclaimer": "This assessment is not a medical diagnosis. Please consult a qualified healthcare professional for proper evaluation and treatment."
    }}"""

        sarvam_response = None
        if settings.sarvam_api_key:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post(
                        "https://api.sarvam.ai/v1/chat/completions",
                        headers={
                            "api-subscription-key": settings.sarvam_api_key,
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": "sarvam-m",
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.2,
                            "max_tokens": 1500
                        }
                    )
                    if res.status_code == 200:
                        content = res.json()["choices"][0]["message"]["content"]
                        # Clean up random markdown backticks if the model added them
                        content = content.replace("```json", "").replace("```", "").strip()
                        sarvam_response = json.loads(content)
            except Exception as e:
                print(f"Error calling Sarvam AI: {e}")

        # Fallback to deterministic mock if API call fails, returned invalid JSON, or key is missing
        if not sarvam_response:
            sarvam_response = {
                "summary": _build_dynamic_summary(risk_level, chat_phq9, audio_emotion, video_dist, video_result),
                "per_modality": {
                    "text": {
                        "summary": text_summary,
                        "risk_contribution": text_fusion,
                    },
                    "audio": {
                        "summary": _build_audio_summary(audio_result, audio_emotion) if audio_result else "Audio analysis not completed.",
                        "risk_contribution": audio_risk,
                    },
                    "video": {
                        "summary": _build_video_summary(video_result, video_dist) if video_result else "Video analysis not completed.",
                        "risk_contribution": video_risk,
                    },
                },
                "fusion_score": fusion_score,
                "risk_level": risk_level,
                "explainability": {
                    "text_weight": 40,
                    "audio_weight": 30,
                    "video_weight": 30,
                    "key_factors": _get_key_factors(chat_phq9, risk_level, audio_emotion, video_dist),
                    "confidence": round(0.5 + fusion_score * 0.3, 2),
                },
                "lifetime_risk_projection": {
                    "current": fusion_score,
                    "6_months": round(max(fusion_score - 0.1, 0.05), 2),
                    "1_year": round(max(fusion_score - 0.2, 0.05), 2),
                    "notes": _build_projection_notes(risk_level, chat_phq9),
                },
                "remedies": _get_remedies(risk_level, chat_phq9, audio_emotion, video_dist),
                "disclaimer": "This assessment is not a medical diagnosis. Please consult a qualified healthcare professional for proper evaluation and treatment.",
            }

        # Create report
        report = AnalysisReport(
            session_id=data.session_id,
            sarvam_response_json=sarvam_response,
            risk_level=risk_level,
            pdf_url=None,
        )
        db.add(report)

        # Mark session as completed
        session.status = "completed"
        await db.flush()

        return ReportResponse.model_validate(report)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] generate_report: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to generate report. Please try again.")


@router.get("/download/{report_id}")
async def download_report_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(select(AnalysisReport).where(AnalysisReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        # Verify ownership
        result = await db.execute(
            select(Session).where(Session.id == report.session_id, Session.user_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized")

        # Generate PDF on the fly
        pdf_bytes = _generate_pdf(report, current_user)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=MindScan_Report_{report.id[:8]}.pdf",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] download_report_pdf: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate PDF")


@router.get("/session/{session_id}", response_model=ReportResponse)
async def get_report_by_session(
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

        result = await db.execute(
            select(AnalysisReport).where(AnalysisReport.session_id == session_id)
        )
        report = result.scalar_one_or_none()
        if not report:
            raise HTTPException(status_code=404, detail="Report not generated yet")

        return ReportResponse.model_validate(report)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_report_by_session: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve report")


@router.get("/history", response_model=List[ReportResponse])
async def get_report_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(AnalysisReport)
            .join(Session, AnalysisReport.session_id == Session.id)
            .where(Session.user_id == current_user.id)
            .order_by(AnalysisReport.created_at.desc())
        )
        reports = result.scalars().all()
        return [ReportResponse.model_validate(r) for r in reports]
    except Exception as e:
        print(f"[ERROR] get_report_history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve report history")


# ──── Helper functions ────

def _build_dynamic_summary(risk_level: str, phq9: dict, audio_emotion: str, video_dist: dict, video_result) -> str:
    """Build a detailed, data-driven summary instead of generic text."""
    parts = [f"Based on multimodal analysis, the user shows {risk_level.lower()} indicators of depressive symptoms."]

    # PHQ-9 specific mentions
    if phq9:
        high_signals = [k.replace("_", " ") for k, v in phq9.items() if isinstance(v, (int, float)) and v > 0.2]
        if high_signals:
            parts.append(f"Text analysis detected {', '.join(high_signals)} as concerning indicators.")

    # Audio specific
    if audio_emotion and audio_emotion != "None":
        if audio_emotion == "sad":
            parts.append("Voice analysis detected a sad emotional tone, suggesting emotional distress.")
        elif audio_emotion == "neutral":
            parts.append("Voice analysis detected a neutral tone with potential flat affect.")
        else:
            parts.append(f"Voice analysis detected {audio_emotion} emotional tone.")

    # Video specific
    if video_dist:
        negative_emotions = {}
        for emo in ["sad", "fearful", "angry"]:
            pct = video_dist.get(emo, 0)
            if pct > 2:
                negative_emotions[emo] = pct
        if negative_emotions:
            emo_str = ", ".join([f"{k} ({v}%)" for k, v in sorted(negative_emotions.items(), key=lambda x: -x[1])])
            parts.append(f"Facial expression analysis showed notable negative emotions: {emo_str}.")
        elif video_result and video_result.dominant_emotion:
            parts.append(f"Facial expression analysis showed predominantly {video_result.dominant_emotion} expression.")

    return " ".join(parts)


def _build_audio_summary(audio_result, audio_emotion: str) -> str:
    """Build detailed audio summary."""
    if audio_emotion == "sad":
        return "Voice patterns indicate sadness with lower pitch variation and slower speech rate, which are common indicators of emotional distress and potential depressive tendencies."
    elif audio_emotion == "neutral":
        return "Voice patterns show a neutral/flat affect with limited emotional expressiveness. Flat affect can sometimes indicate emotional numbness or suppressed emotions."
    elif audio_emotion == "happy":
        return "Voice patterns indicate positive emotional expression with good energy and pitch variation, suggesting a generally positive emotional state."
    else:
        return f"Voice patterns indicate {audio_emotion} emotional expression during the recording session."


def _build_video_summary(video_result, video_dist: dict) -> str:
    """Build detailed video summary from actual distribution data."""
    if not video_dist:
        frames = (video_result.emotion_timeline_json or {}).get("frames", [])
        if frames:
            return f"Facial expression capture recorded {len(frames)} frames. Distribution not yet computed."
        return "Video capture completed but no significant facial expressions were detected."

    # Build a readable summary from the distribution
    sorted_dist = sorted(video_dist.items(), key=lambda x: -x[1])
    top_emotions = [(k, v) for k, v in sorted_dist if v > 3][:4]

    if not top_emotions:
        return "Facial expression analysis showed minimal emotional variation."

    parts = ["Facial expression analysis revealed: "]
    emo_parts = [f"{k} ({v}%)" for k, v in top_emotions]
    parts.append(", ".join(emo_parts))
    parts.append(".")

    # Add clinical insight
    negative_total = sum(video_dist.get(e, 0) for e in ["sad", "fearful", "angry"])
    if negative_total > 30:
        parts.append(f" Negative emotions constitute {negative_total:.0f}% of detected expressions, indicating significant emotional distress.")
    elif negative_total > 10:
        parts.append(f" Negative emotions constitute {negative_total:.0f}% of expressions, suggesting moderate emotional concern.")

    dominant = video_result.dominant_emotion
    if dominant:
        parts.append(f" Dominant expression: {dominant}.")

    return "".join(parts)


def _build_projection_notes(risk_level: str, phq9: dict) -> str:
    """Build specific projection notes."""
    if risk_level == "High":
        notes = "High current risk suggests urgent need for professional intervention. "
        if phq9 and phq9.get("self_harm", 0) > 0:
            notes += "Self-harm ideation detected — immediate crisis support is strongly recommended. "
        notes += "With consistent therapy and support, risk can decrease significantly within 6 months."
        return notes
    elif risk_level == "Moderate":
        notes = "Moderate risk indicates developing concerns that should be addressed proactively. "
        if phq9:
            issues = [k.replace("_", " ") for k, v in phq9.items() if isinstance(v, (int, float)) and v > 0.2]
            if issues:
                notes += f"Key areas to address: {', '.join(issues)}. "
        notes += "Early intervention can prevent escalation."
        return notes
    else:
        return "Current indicators suggest low risk. Maintaining healthy habits and social connections will support continued wellbeing."


def _get_key_factors(phq9: dict, risk_level: str, audio_emotion: str = "None", video_dist: dict = None) -> list:
    """Generate key factors from ALL modality data, not just PHQ-9."""
    factors = []

    # PHQ-9 specific factors
    if phq9:
        if phq9.get("hopelessness", 0) > 0.2:
            factors.append("Expressions of hopelessness and low motivation detected in conversation")
        if phq9.get("fatigue", 0) > 0.2:
            factors.append("Reports of persistent fatigue and low energy levels")
        if phq9.get("sleep_issues", 0) > 0.2:
            factors.append("Sleep disturbances and insomnia patterns reported")
        if phq9.get("anhedonia", 0) > 0.2:
            factors.append("Reduced interest and pleasure in daily activities (anhedonia)")
        if phq9.get("appetite_changes", 0) > 0.2:
            factors.append("Changes in appetite or eating patterns reported")
        if phq9.get("concentration", 0) > 0.2:
            factors.append("Difficulty concentrating or persistent brain fog")
        if phq9.get("self_harm", 0) > 0:
            factors.append("⚠️ Concerning statements about self-harm or suicidal ideation detected")

    # Audio-specific factors
    if audio_emotion == "sad":
        factors.append("Voice analysis detected sad emotional tone with potential flat affect")
    elif audio_emotion == "neutral":
        factors.append("Voice patterns show limited emotional expressiveness (potential flat affect)")

    # Video-specific factors
    if video_dist:
        sad_pct = video_dist.get("sad", 0)
        fear_pct = video_dist.get("fearful", 0)
        angry_pct = video_dist.get("angry", 0)

        if sad_pct > 20:
            factors.append(f"Facial expressions show significant sadness ({sad_pct}% of captured frames)")
        elif sad_pct > 5:
            factors.append(f"Notable sadness detected in facial expressions ({sad_pct}%)")

        if fear_pct > 10:
            factors.append(f"Fearful expressions detected ({fear_pct}% of frames), suggesting anxiety")

        if angry_pct > 10:
            factors.append(f"Anger detected in facial expressions ({angry_pct}%), possibly indicating frustration or irritability")

    # Fallback if nothing specific was detected
    if not factors:
        if risk_level == "High":
            factors = ["Multiple negative sentiment indicators detected across modalities", "Consistent patterns of emotional distress"]
        elif risk_level == "Moderate":
            factors = ["Some negative sentiment indicators present", "Mixed emotional expressions across modalities"]
        else:
            factors = ["Generally positive or neutral sentiment", "No significant risk indicators detected"]

    return factors


def _get_remedies(risk_level: str, phq9: dict = None, audio_emotion: str = "None", video_dist: dict = None) -> list:
    """Generate PERSONALIZED recommendations based on ALL modality data."""
    remedies = []

    # Crisis-level recommendations
    if phq9 and phq9.get("self_harm", 0) > 0:
        remedies.extend([
            "🚨 URGENT: If you are having thoughts of self-harm, please contact a crisis helpline immediately — iCall: 9152987821, Vandrevala Foundation: 1860-2662-345",
            "Reach out to a trusted person (friend, family member, or counselor) and share what you're feeling today",
        ])

    # Targeted recommendations based on detected PHQ-9 signals
    if phq9:
        if phq9.get("sleep_issues", 0) > 0.2:
            remedies.append("Sleep hygiene: Set a consistent bedtime, avoid screens 1 hour before sleep, try a 10-minute relaxation exercise before bed")
        if phq9.get("fatigue", 0) > 0.2:
            remedies.append("Combat fatigue: Start with gentle 15-minute walks, ensure adequate hydration, consider vitamin D and B12 levels with your doctor")
        if phq9.get("anhedonia", 0) > 0.2:
            remedies.append("Re-engage with activities: Make a list of 3 things you used to enjoy and try one this week, even for just 10 minutes")
        if phq9.get("hopelessness", 0) > 0.2:
            remedies.append("Challenge hopeless thoughts: Write down one small thing that went okay today. Cognitive behavioral therapy (CBT) can help restructure negative thinking patterns")
        if phq9.get("appetite_changes", 0) > 0.2:
            remedies.append("Nutrition support: Try to eat regular, balanced meals even when appetite is low. Small frequent meals may be easier to manage")
        if phq9.get("concentration", 0) > 0.2:
            remedies.append("Focus improvement: Break tasks into small chunks (25 min work, 5 min break). Reduce multitasking and try mindfulness exercises")

    # Audio-based recommendations
    if audio_emotion == "sad":
        remedies.append("Voice patterns suggest emotional distress: Consider journaling your feelings or practicing guided emotional expression exercises")
    
    # Video-based recommendations
    if video_dist:
        sad_pct = video_dist.get("sad", 0)
        fear_pct = video_dist.get("fearful", 0)
        angry_pct = video_dist.get("angry", 0)

        if sad_pct > 15:
            remedies.append("Facial analysis shows persistent sadness: Engage in mood-lifting activities like listening to uplifting music, spending time outdoors, or connecting with a supportive friend")
        if fear_pct > 10:
            remedies.append("Anxiety indicators detected in facial expressions: Try box breathing (4-4-4-4 pattern) when feeling anxious, and consider progressive muscle relaxation")
        if angry_pct > 10:
            remedies.append("Frustration/irritability detected: Physical exercise like brisk walking or boxing can help channel anger constructively. Journaling anger triggers can build self-awareness")

    # Risk-level based additions
    if risk_level == "High":
        remedies.insert(0, "Strongly consider scheduling an appointment with a licensed therapist or counselor within the next week")
        if len(remedies) < 5:
            remedies.append("Consider talking to your primary care doctor about your mental health — they can coordinate appropriate care")
    elif risk_level == "Moderate":
        remedies.append("Consider speaking with a licensed therapist or counselor to develop coping strategies")
        remedies.append("Keep a daily mood journal to track emotional patterns and identify triggers")

    # Universal self-care (add only if we don't already have many specific ones)
    if len(remedies) < 5:
        base = [
            "Maintain regular social connections — even brief daily contact with friends or family helps",
            "Aim for 30 minutes of physical activity daily (walking, yoga, or any movement you enjoy)",
            "Practice mindfulness or meditation for 10 minutes daily (apps like Headspace or Calm can guide you)",
            "Establish a consistent daily routine including regular sleep, meal, and activity times",
        ]
        for b in base:
            if len(remedies) >= 7:
                break
            remedies.append(b)

    return remedies[:8]  # Cap at 8 recommendations


def _generate_pdf(report: AnalysisReport, user: User) -> bytes:
    """Generate a real PDF report using fpdf2."""
    from fpdf import FPDF
    import json
    
    def _safe(text) -> str:
        """Sanitize text for fpdf2 built-in fonts (Latin-1 only)."""
        if not isinstance(text, str):
            text = str(text) if text is not None else ""
        # Replace common Unicode chars with ASCII equivalents
        replacements = {
            '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
            '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '*',
            '\u00a0': ' ', '\u200b': '', '\u200e': '', '\u200f': '',
            '🚨': '[!]', '⚠️': '[!]', '🧠': '*', '💤': '*', '🏃': '*',
            '🧘': '*', '👥': '*', '📱': '*', '✨': '*',
        }
        for k, v in replacements.items():
            text = text.replace(k, v)
        # Strip any remaining non-Latin1 characters
        return text.encode('latin-1', errors='replace').decode('latin-1')
    
    data = report.sarvam_response_json or {}
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {}
        
    risk = report.risk_level or "Unknown"
    created = report.created_at.strftime("%B %d, %Y at %I:%M %p") if report.created_at else "N/A"

    class PDF(FPDF):
        def header(self):
            self.set_font("helvetica", "B", 16)
            self.cell(0, 10, "MindScan - Mental Health Analysis Report", new_x="LMARGIN", new_y="NEXT", align="C")
            self.line(10, 22, 200, 22)
            self.ln(10)
            
        def footer(self):
            self.set_y(-15)
            self.set_font("helvetica", "I", 8)
            self.cell(0, 10, f"Page {self.page_no()}", align="C")

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    lm = pdf.l_margin
    
    # Info
    pdf.set_font("helvetica", "", 12)
    pdf.set_x(lm)
    pdf.cell(0, 8, _safe(f"Patient: {user.name}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, _safe(f"Date: {created}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, _safe(f"Report ID: {report.id}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    # Risk
    pdf.set_font("helvetica", "B", 14)
    if risk == "High":
        pdf.set_text_color(220, 50, 50)
    elif risk == "Moderate":
        pdf.set_text_color(200, 150, 0)
    else:
        pdf.set_text_color(50, 150, 50)
    pdf.set_x(lm)
    pdf.cell(0, 10, _safe(f"RISK LEVEL: {risk}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, _safe(f"Fusion Score: {data.get('fusion_score', 'N/A')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    # Summary
    pdf.set_font("helvetica", "B", 12)
    pdf.set_x(lm)
    pdf.cell(0, 8, "SUMMARY", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 11)
    pdf.set_x(lm)
    pdf.multi_cell(0, 6, _safe(data.get("summary", "No summary available.")))
    pdf.ln(5)
    
    # Modalities
    per_mod = data.get("per_modality", {})
    if isinstance(per_mod, dict):
        for mod_name, mod_data in per_mod.items():
            pdf.set_font("helvetica", "B", 11)
            pdf.set_x(lm)
            pdf.cell(0, 8, _safe(f"{mod_name.upper()} ANALYSIS"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 10)
            if isinstance(mod_data, dict):
                pdf.set_x(lm)
                pdf.multi_cell(0, 6, _safe(mod_data.get("summary", "N/A")))
                pdf.set_x(lm)
                pdf.cell(0, 6, _safe(f"Risk Contribution: {mod_data.get('risk_contribution', 'N/A')}"), new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.set_x(lm)
                pdf.multi_cell(0, 6, _safe(str(mod_data)))
            pdf.ln(3)

    # Key Factors
    explain = data.get("explainability", {})
    if isinstance(explain, dict):
        factors = explain.get("key_factors", [])
        if isinstance(factors, list) and factors:
            pdf.set_font("helvetica", "B", 11)
            pdf.set_x(lm)
            pdf.cell(0, 8, "KEY FACTORS", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 10)
            for f in factors:
                pdf.set_x(lm)
                pdf.multi_cell(0, 6, _safe(f"- {f}"))
            pdf.ln(3)

    # Remedies
    remedy_data = data.get("remedies", [])
    if isinstance(remedy_data, list):
        remedies = remedy_data
    elif isinstance(remedy_data, dict):
        remedies = remedy_data.get("immediate", []) + remedy_data.get("long_term", [])
    else:
        remedies = []
        
    if remedies:
        pdf.set_font("helvetica", "B", 11)
        pdf.set_x(lm)
        pdf.cell(0, 8, "RECOMMENDATIONS", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 10)
        for r in remedies:
            pdf.set_x(lm)
            pdf.multi_cell(0, 6, _safe(f"- {r}"))
        pdf.ln(3)

    # Disclaimer
    disclaimer = data.get("disclaimer", "")
    if disclaimer:
        pdf.ln(5)
        pdf.set_font("helvetica", "I", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.set_x(lm)
        pdf.multi_cell(0, 5, _safe(disclaimer))
        pdf.set_text_color(0, 0, 0)

    # Return as bytes
    return bytes(pdf.output())
