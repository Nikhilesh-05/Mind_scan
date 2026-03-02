"""Async SQLAlchemy database engine and session management."""
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# ---------------------------------------------------------
# Database engine setup
# Uses SQLite by default for local dev (no PostgreSQL needed)
# Set USE_POSTGRES=true to use PostgreSQL instead
# ---------------------------------------------------------
_use_postgres = os.environ.get("USE_POSTGRES", "").lower() == "true"

if _use_postgres:
    _db_url = settings.database_url
    print("[INFO] Using PostgreSQL")
else:
    _db_url = "sqlite+aiosqlite:///./dev.db"
    print("[INFO] Using SQLite (dev.db) - set USE_POSTGRES=true for PostgreSQL")

engine = create_async_engine(_db_url, echo=False, future=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables. Used for development; use Alembic in production."""
    try:
        async with engine.begin() as conn:
            from app.models import User, Session, ChatResult, AudioResult, VideoResult, AnalysisReport  # noqa
            await conn.run_sync(Base.metadata.create_all)
        print("[OK] Database tables created successfully")
    except Exception as e:
        print(f"[ERROR] Database init failed: {e}")
