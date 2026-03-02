"""Application configuration loaded from environment variables."""
import json
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # --- Database ---
    postgres_user: str = "depression_user"
    postgres_password: str = "password"
    postgres_db: str = "depression_detection"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- JWT ---
    jwt_secret_key: str = "change-me-super-secret-key"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    # --- AI Services ---
    openai_api_key: str = ""
    sarvam_api_key: str = ""
    mock_ai_services: bool = True

    # --- Cloudinary ---
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # --- App ---
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    cors_origins: str = '["http://localhost:5173"]'

    @property
    def cors_origin_list(self) -> List[str]:
        return json.loads(self.cors_origins)

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }


settings = Settings()
