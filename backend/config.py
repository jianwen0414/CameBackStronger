"""
NightWalk Backend Configuration
Loads environment variables and provides typed configuration.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    
    # Google Cloud Storage
    gcs_bucket_name: str = "nightwalk-evidence"
    
    # Google Maps
    google_maps_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    
    # VideoMAE Crime Classification
    videomae_model_name: str = "OPear/videomae-large-finetuned-UCF-Crime"
    classification_confidence_threshold: float = 0.3
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
