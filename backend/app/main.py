"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Create tables on startup (dev mode)
    await init_db()
    yield


app = FastAPI(
    title="Multimodal Depression Detection API",
    description="Analyzes mental state through text, audio, and video modalities",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from app.routers import auth, chat, audio, video, report, session  # noqa

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(session.router, prefix="/sessions", tags=["Sessions"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(audio.router, prefix="/audio", tags=["Audio"])
app.include_router(video.router, prefix="/video", tags=["Video"])
app.include_router(report.router, prefix="/report", tags=["Report"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "depression-detection-api"}
