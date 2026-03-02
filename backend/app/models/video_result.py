"""Video result ORM model."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VideoResult(Base):
    __tablename__ = "video_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    emotion_timeline_json: Mapped[dict] = mapped_column(JSON, default=dict)
    dominant_emotion: Mapped[str] = mapped_column(String(50), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="video_result")
