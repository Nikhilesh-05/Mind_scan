"""Chat result ORM model."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChatResult(Base):
    __tablename__ = "chat_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    conversation_json: Mapped[dict] = mapped_column(JSON, default=dict)
    sentiment_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    phq9_signals: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="chat_result")
