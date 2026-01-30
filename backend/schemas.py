"""
NightWalk API Schemas
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

class AlertType(str, Enum):
    """Types of alerts from CCTV detection."""
    FIGHT = "fight"
    WEAPON = "weapon"
    ROBBERY = "robbery"
    LOITERING = "loitering"
    SUSPICIOUS = "suspicious"


class AlertStatus(str, Enum):
    """Status of suspicious activity logs."""
    PENDING = "pending"
    RESOLVED = "resolved"


class UserRole(str, Enum):
    """User roles in the system."""
    CITIZEN = "citizen"
    ADMIN = "admin"
    IOT_DEVICE = "iot_device"


# ============================================================================
# Request Models
# ============================================================================

class CCTVAlertRequest(BaseModel):
    """Request from IoT camera when activity is detected."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    long: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    type: AlertType = Field(..., description="Type of detected activity")
    gcs_url: str = Field(..., description="Google Cloud Storage URL for evidence video")
    person_id_hash: Optional[str] = Field(None, description="Anonymized person identifier")
    location_id: Optional[str] = Field(None, description="Camera/location identifier")
    
    @field_validator("gcs_url")
    @classmethod
    def validate_gcs_url(cls, v: str) -> str:
        """Ensure URL is a valid GCS path."""
        if not (v.startswith("gs://") or v.startswith("https://storage.googleapis.com/")):
            raise ValueError("Must be a valid GCS URL (gs:// or https://storage.googleapis.com/)")
        return v


class NearbyQueryRequest(BaseModel):
    """Query parameters for nearby hazards search."""
    lat: float = Field(..., ge=-90, le=90)
    long: float = Field(..., ge=-180, le=180)
    radius: float = Field(500.0, gt=0, le=5000, description="Search radius in meters")


class AuthLoginRequest(BaseModel):
    """Login request with Supabase auth token."""
    access_token: str = Field(..., description="Supabase JWT access token")


# ============================================================================
# Response Models
# ============================================================================

class Coordinates(BaseModel):
    """Geographic coordinates."""
    lat: float
    long: float


class HazardResponse(BaseModel):
    """Single hazard item for AR overlay."""
    id: str
    coordinates: Coordinates
    type: AlertType
    distance_meters: float
    bearing_degrees: float
    is_immediate: bool = Field(..., description="True for immediate danger, False for suspicious")
    detected_at: datetime
    evidence_url: Optional[str] = None


class NearbyHazardsResponse(BaseModel):
    """Response containing all hazards within radius."""
    hazards: list[HazardResponse]
    query_center: Coordinates
    radius_meters: float
    total_count: int


class ImmediateDangerLog(BaseModel):
    """Immediate danger log entry."""
    id: str
    coordinates: Coordinates
    activity_type: AlertType
    evidence_video_url: str
    is_active: bool
    detected_at: datetime


class SuspiciousLog(BaseModel):
    """Suspicious individual log entry."""
    id: str
    coordinates: Coordinates
    location_id: Optional[str]
    person_id_hash: Optional[str]
    evidence_video_url: str
    status: AlertStatus
    detected_at: datetime


class AlertCreatedResponse(BaseModel):
    """Response after creating an alert."""
    success: bool
    alert_id: str
    alert_type: Literal["immediate_danger", "suspicious"]
    message: str


class AuthResponse(BaseModel):
    """Authentication response."""
    success: bool
    user_id: str
    role: UserRole
    message: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: datetime
    version: str = "1.0.0"
