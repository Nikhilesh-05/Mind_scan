"""Pydantic schemas for request/response validation."""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


# ====== Auth ======

class UserRegister(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ====== Session ======

class SessionResponse(BaseModel):
    id: str
    user_id: str
    status: str
    created_at: datetime
    chat_completed: bool = False
    audio_completed: bool = False
    video_completed: bool = False

    class Config:
        from_attributes = True


class SessionCreate(BaseModel):
    pass


# ====== Chat ======

class ChatMessageRequest(BaseModel):
    session_id: str
    message: str


class ChatMessageResponse(BaseModel):
    bot_reply: str
    sentiment: Dict[str, float]
    phq9_signals: Dict[str, Any]
    conversation_length: int


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[Dict[str, str]]
    sentiment_scores: Dict[str, Any]
    phq9_signals: Dict[str, Any]


# ====== Audio ======

class AudioResultResponse(BaseModel):
    id: str
    session_id: str
    transcription: Optional[str]
    prosodic_features_json: Optional[Dict[str, Any]]
    emotion_label: Optional[str]
    confidence: Optional[float]

    class Config:
        from_attributes = True


# ====== Video ======

class EmotionFrameRequest(BaseModel):
    session_id: str
    timestamp: float
    emotions: Dict[str, float]
    dominant_emotion: str


class VideoResultResponse(BaseModel):
    id: str
    session_id: str
    emotion_timeline_json: Optional[Dict[str, Any]]
    dominant_emotion: Optional[str]
    duration_seconds: Optional[int]

    class Config:
        from_attributes = True


# ====== Report ======

class ReportGenerateRequest(BaseModel):
    session_id: str


class ReportResponse(BaseModel):
    id: str
    session_id: str
    risk_level: Optional[str]
    sarvam_response_json: Optional[Dict[str, Any]]
    pdf_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
