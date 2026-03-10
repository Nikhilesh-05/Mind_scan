"""FastAPI application entry point."""
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Create tables on startup (dev mode) — never crash the app
    try:
        await init_db()
    except Exception as e:
        print(f"[WARN] Database init error (non-fatal): {e}")
    yield


app = FastAPI(
    title="Multimodal Depression Detection API",
    description="Analyzes mental state through text, audio, and video modalities",
    version="1.0.0",
    lifespan=lifespan,
)


# Global exception handler — prevents 500 crashes from killing the server
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return a JSON error instead of crashing."""
    print(f"[ERROR] Unhandled exception on {request.method} {request.url.path}:")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
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
