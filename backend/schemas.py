"""
NightWalk API Schemas
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional, List
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


class CrimeType(str, Enum):
    """Types of crimes users can report."""
    ABUSE = "abuse"
    ARREST = "arrest"
    ARSON = "arson"
    ASSAULT = "assault"
    BURGLARY = "burglary"
    EXPLOSION = "explosion"
    FIGHTING = "fighting"
    ROAD_ACCIDENTS = "road_accidents"
    ROBBERY = "robbery"
    SHOOTING = "shooting"
    STEALING = "stealing"
    VANDALISM = "vandalism"


class ValidationStatus(str, Enum):
    """Status of user-reported crime validation."""
    PENDING = "pending"
    PROCESSING = "processing"
    VALIDATED = "validated"
    REJECTED = "rejected"
    REVIEWED = "reviewed"


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


class UserReportCrimeRequest(BaseModel):
    """Request from mobile app user to report a crime."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    long: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    crime_type: CrimeType = Field(..., description="Type of crime being reported")
    description: Optional[str] = Field(None, description="Description of the incident")
    evidence_video_url: str = Field(..., description="URL to the uploaded video evidence")
    video_duration_seconds: Optional[float] = Field(None, ge=7.0, description="Video duration (min 7 seconds)")
    reporter_id: Optional[str] = Field(None, description="Reporter user ID")


class CCTVCreateRequest(BaseModel):
    """Request to register a new CCTV camera."""
    camera_name: str = Field(..., description="Camera identifier name")
    location_name: Optional[str] = Field(None, description="Human-readable location")
    lat: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    long: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    stream_url: Optional[str] = Field(None, description="URL for live stream or sample video")
    zone_id: Optional[str] = Field(None, description="Zone grouping identifier")


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


# ============================================================================
# CCTV Response Models
# ============================================================================

class CCTVCameraResponse(BaseModel):
    """Single CCTV camera info."""
    id: str
    camera_name: str
    location_name: Optional[str] = None
    lat: float
    long: float
    stream_url: Optional[str] = None
    is_active: bool
    last_heartbeat: Optional[datetime] = None


class CCTVCamerasListResponse(BaseModel):
    """List of CCTV cameras."""
    cameras: List[CCTVCameraResponse]
    total_count: int


# ============================================================================
# User Crime Report Response Models
# ============================================================================

class UserReportedCrimeResponse(BaseModel):
    """Single user-reported crime entry."""
    id: str
    reporter_id: Optional[str] = None
    lat: float
    long: float
    crime_type: str
    description: Optional[str] = None
    evidence_video_url: str
    classified_crime_type: Optional[str] = None
    classification_confidence: Optional[float] = None
    gemini_analysis: Optional[str] = None
    gemini_justification: Optional[str] = None
    validation_status: str
    reported_at: datetime


class UserReportedCrimesListResponse(BaseModel):
    """List of user-reported crimes."""
    reports: List[UserReportedCrimeResponse]
    total_count: int


class ReportCreatedResponse(BaseModel):
    """Response after creating a user crime report."""
    success: bool
    report_id: str
    message: str
    validation_status: str
