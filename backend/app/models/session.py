"""Session ORM model - represents a single analysis session."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress | completed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="sessions")
    chat_result = relationship("ChatResult", back_populates="session", uselist=False, cascade="all, delete-orphan")
    audio_result = relationship("AudioResult", back_populates="session", uselist=False, cascade="all, delete-orphan")
    video_result = relationship("VideoResult", back_populates="session", uselist=False, cascade="all, delete-orphan")
    analysis_report = relationship("AnalysisReport", back_populates="session", uselist=False, cascade="all, delete-orphan")
