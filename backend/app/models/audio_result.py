"""Audio result ORM model."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, JSON, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AudioResult(Base):
    __tablename__ = "audio_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    transcription: Mapped[str] = mapped_column(Text, nullable=True)
    prosodic_features_json: Mapped[dict] = mapped_column(JSON, default=dict)
    emotion_label: Mapped[str] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="audio_result")
