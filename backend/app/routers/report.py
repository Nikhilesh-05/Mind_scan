"""Report generation and download API routes with PDF support."""
import io
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
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
    # Verify session
    result = await db.execute(
        select(Session).where(Session.id == data.session_id, Session.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if report already exists for this session
    existing = await db.execute(
        select(AnalysisReport).where(AnalysisReport.session_id == data.session_id).order_by(AnalysisReport.created_at.desc())
    )
    existing_report = existing.scalars().first()
    if existing_report:
        return ReportResponse.model_validate(existing_report)

    # Gather all modality data
    chat = await db.execute(select(ChatResult).where(ChatResult.session_id == data.session_id).order_by(ChatResult.created_at.desc()))
    chat_result = chat.scalars().first()

    audio = await db.execute(select(AudioResult).where(AudioResult.session_id == data.session_id).order_by(AudioResult.created_at.desc()))
    audio_result = audio.scalars().first()

    video = await db.execute(select(VideoResult).where(VideoResult.session_id == data.session_id).order_by(VideoResult.created_at.desc()))
    video_result = video.scalars().first()

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
        video_dist = video_result.emotion_timeline_json.get("distribution", {})
        sad_pct = video_dist.get("sad", 0) / 100.0
        fear_pct = video_dist.get("fearful", 0) / 100.0
        angry_pct = video_dist.get("angry", 0) / 100.0
        video_risk = min((sad_pct * 1.5) + (fear_pct * 1.2) + (angry_pct * 1.0), 0.95)

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
        # Instead of a simple average which dilutes high risk, we use a max-weighted 
        # approach. In mental health, if one modality raises a severe red flag, 
        # the overall risk should reflect that severity.
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
    Video Analysis: Emotion Distribution: {video_dist}, Risk: {video_risk:.2f}
    Base Calculated Fusion Score: {fusion_score}
    Base Calculated Risk Level: {risk_level}

    Format your response STRICTLY as valid JSON matching this exact structure, with NO markdown formatting or other text wrappers:
    {{
        "summary": "High-level professional summary of the patient's depressive indicators.",
        "per_modality": {{
            "text": {{"summary": "Analysis of text chat", "risk_contribution": <float 0.0-1.0>}},
            "audio": {{"summary": "Analysis of audio/voice (or state 'Not available/completed')", "risk_contribution": <float 0.0-1.0>}},
            "video": {{"summary": "Analysis of video/facial expressions (or state 'Not available/completed')", "risk_contribution": <float 0.0-1.0>}}
        }},
        "fusion_score": <float 0.0-1.0>,
        "risk_level": "Low" | "Moderate" | "High",
        "explainability": {{
            "text_weight": 40, "audio_weight": 30, "video_weight": 30,
            "key_factors": ["risk factor 1", "risk factor 2"],
            "confidence": <float 0.0-1.0>
        }},
        "lifetime_risk_projection": {{
            "current": <float>, "6_months": <float>, "1_year": <float>, "notes": "Projection notes"
        }},
        "remedies": ["recommendation 1", "recommendation 2", "recommendation 3"],
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
                        "max_tokens": 1000
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
            "summary": f"Based on multimodal analysis, the user shows {risk_level.lower()} indicators of depressive symptoms. (Fallback/Mock)",
            "per_modality": {
                "text": {
                    "summary": text_summary,
                    "risk_contribution": text_fusion,
                },
                "audio": {
                    "summary": f"Voice patterns indicate {audio_emotion} emotion." if audio_result else "Audio analysis not completed.",
                    "risk_contribution": audio_risk,
                },
                "video": {
                    "summary": f"Facial expressions analyzed. Distribution: {video_dist}" if video_result else "Video analysis not completed.",
                    "risk_contribution": video_risk,
                },
            },
            "fusion_score": fusion_score,
            "risk_level": risk_level,
            "explainability": {
                "text_weight": 40,
                "audio_weight": 30,
                "video_weight": 30,
                "key_factors": _get_key_factors(chat_phq9, risk_level),
                "confidence": round(0.5 + fusion_score * 0.3, 2),
            },
            "lifetime_risk_projection": {
                "current": fusion_score,
                "6_months": round(max(fusion_score - 0.1, 0.05), 2),
                "1_year": round(max(fusion_score - 0.2, 0.05), 2),
                "notes": "Risk may decrease with early intervention, therapy, and lifestyle changes.",
            },
            "remedies": _get_remedies(risk_level),
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


@router.get("/download/{report_id}")
async def download_report_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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


@router.get("/session/{session_id}", response_model=ReportResponse)
async def get_report_by_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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


@router.get("/history", response_model=List[ReportResponse])
async def get_report_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AnalysisReport)
        .join(Session, AnalysisReport.session_id == Session.id)
        .where(Session.user_id == current_user.id)
        .order_by(AnalysisReport.created_at.desc())
    )
    reports = result.scalars().all()
    return [ReportResponse.model_validate(r) for r in reports]


# ──── Helper functions ────

def _get_key_factors(phq9: dict, risk_level: str) -> list:
    factors = []
    if phq9:
        if phq9.get("hopelessness", 0) > 0.2:
            factors.append("Expressions of hopelessness and low motivation")
        if phq9.get("fatigue", 0) > 0.2:
            factors.append("Reports of fatigue and low energy")
        if phq9.get("sleep_issues", 0) > 0.2:
            factors.append("Sleep disturbances reported")
        if phq9.get("anhedonia", 0) > 0.2:
            factors.append("Reduced interest in activities")
        if phq9.get("self_harm", 0) > 0:
            factors.append("Concerning statements about self-harm detected")

    if not factors:
        if risk_level == "High":
            factors = ["Multiple negative sentiment indicators detected", "Consistent low mood in conversation"]
        elif risk_level == "Moderate":
            factors = ["Some negative sentiment indicators present", "Mixed emotional expressions"]
        else:
            factors = ["Generally positive or neutral sentiment", "No significant risk indicators detected"]

    return factors


def _get_remedies(risk_level: str) -> list:
    base = [
        "Maintain social connections and avoid isolation",
        "Establish a regular sleep schedule (7-9 hours)",
        "Engage in 30 minutes of physical activity daily",
        "Practice mindfulness meditation for 10 minutes daily",
    ]
    if risk_level == "High":
        return [
            "Strongly consider speaking with a licensed therapist or counselor immediately",
            "Contact a trusted friend or family member about how you're feeling",
            "If in crisis, call a helpline: iCall (9152987821) or Vandrevala Foundation (1860-2662-345)",
        ] + base
    elif risk_level == "Moderate":
        return [
            "Consider speaking with a licensed therapist or counselor",
        ] + base + [
            "Keep a daily mood journal to track emotional patterns",
            "Limit screen time before bedtime",
        ]
    else:
        return base + [
            "Continue positive habits and self-care routines",
            "Stay connected with supportive relationships",
        ]


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


