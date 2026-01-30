"""
NightWalk Backend - FastAPI Application
Urban Safety Ecosystem API for IoT cameras, mobile AR, and web dashboard.
"""
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

from config import get_settings, Settings
from schemas import (
    CCTVAlertRequest,
    NearbyHazardsResponse,
    HazardResponse,
    Coordinates,
    AuthLoginRequest,
    AuthResponse,
    AlertCreatedResponse,
    HealthResponse,
    AlertType,
    UserRole
)
from database import (
    insert_immediate_danger,
    insert_suspicious_log,
    find_nearby_hazards,
    get_all_alerts,
    verify_user_token
)


# ============================================================================
# Application Lifecycle
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print("🌃 NightWalk Backend starting...")
    print("🔗 Connecting to Supabase...")
    yield
    # Shutdown
    print("🌃 NightWalk Backend shutting down...")


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="NightWalk API",
    description="Urban Safety Ecosystem - Backend API for IoT cameras, mobile AR overlay, and control room dashboard.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],  # Allow all for hackathon
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health Check
# ============================================================================

@app.get("/", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="operational",
        timestamp=datetime.utcnow(),
        version="1.0.0"
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """Alternative health check endpoint."""
    return await health_check()


# ============================================================================
# CCTV / IoT Endpoints
# ============================================================================

@app.post("/alerts/cctv", response_model=AlertCreatedResponse, tags=["Alerts"])
async def receive_cctv_alert(alert: CCTVAlertRequest):
    """
    Receive alert from IoT/CCTV camera.
    
    Routes to appropriate table based on alert type:
    - fight, weapon, robbery -> immediate_danger_logs (triggers Red Beacon)
    - loitering, suspicious -> suspicious_individual_logs (Pending Ticket)
    """
    try:
        # Determine if this is immediate danger or suspicious activity
        immediate_types = {AlertType.FIGHT, AlertType.WEAPON, AlertType.ROBBERY}
        
        if alert.type in immediate_types:
            # Insert into immediate_danger_logs
            result = await insert_immediate_danger(
                lat=alert.lat,
                long=alert.long,
                activity_type=alert.type.value,
                evidence_url=alert.gcs_url
            )
            
            return AlertCreatedResponse(
                success=True,
                alert_id=result.get("id", "unknown"),
                alert_type="immediate_danger",
                message=f"🚨 RED BEACON triggered for {alert.type.value} at ({alert.lat}, {alert.long})"
            )
        else:
            # Insert into suspicious_individual_logs
            result = await insert_suspicious_log(
                lat=alert.lat,
                long=alert.long,
                evidence_url=alert.gcs_url,
                person_id_hash=alert.person_id_hash,
                location_id=alert.location_id
            )
            
            return AlertCreatedResponse(
                success=True,
                alert_id=result.get("id", "unknown"),
                alert_type="suspicious",
                message=f"📋 Pending ticket created for suspicious activity at ({alert.lat}, {alert.long})"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process CCTV alert: {str(e)}"
        )


# ============================================================================
# Nearby Hazards (For Mobile AR)
# ============================================================================

@app.get("/alerts/nearby", response_model=NearbyHazardsResponse, tags=["Alerts"])
async def get_nearby_hazards(
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitude")],
    long: Annotated[float, Query(ge=-180, le=180, description="Longitude")],
    radius: Annotated[float, Query(gt=0, le=5000, description="Radius in meters")] = 500.0
):
    """
    Find all hazards within specified radius.
    
    Uses PostGIS ST_DWithin for efficient spatial query.
    Returns data formatted for AR overlay rendering.
    """
    try:
        hazards = await find_nearby_hazards(lat, long, radius)
        
        response_hazards = [
            HazardResponse(
                id=h["id"],
                coordinates=Coordinates(lat=h["lat"], long=h["long"]),
                type=AlertType(h["type"]) if h["type"] in [e.value for e in AlertType] else AlertType.SUSPICIOUS,
                distance_meters=h["distance"],
                bearing_degrees=h["bearing"],
                is_immediate=h["is_immediate"],
                detected_at=h["detected_at"],
                evidence_url=h.get("evidence_url")
            )
            for h in hazards
        ]
        
        return NearbyHazardsResponse(
            hazards=response_hazards,
            query_center=Coordinates(lat=lat, long=long),
            radius_meters=radius,
            total_count=len(response_hazards)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query nearby hazards: {str(e)}"
        )


@app.get("/alerts/all", tags=["Alerts"])
async def get_all_alerts_endpoint(
    limit: Annotated[int, Query(ge=1, le=500)] = 100
):
    """
    Get all alerts for dashboard display.
    Returns both immediate dangers and suspicious logs.
    """
    try:
        return await get_all_alerts(limit)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch alerts: {str(e)}"
        )


# ============================================================================
# Authentication
# ============================================================================

@app.post("/auth/login", response_model=AuthResponse, tags=["Auth"])
async def login(auth_request: AuthLoginRequest):
    """
    Verify Supabase Auth token and return user info with role.
    """
    user_info = await verify_user_token(auth_request.access_token)
    
    if not user_info:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token"
        )
    
    return AuthResponse(
        success=True,
        user_id=user_info["user_id"],
        role=UserRole(user_info["role"]),
        message="Authentication successful"
    )


@app.get("/auth/verify", tags=["Auth"])
async def verify_token(
    authorization: str = Query(..., description="Bearer token")
):
    """
    Verify a token from Authorization header.
    """
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    user_info = await verify_user_token(token)
    
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return {"valid": True, "user_id": user_info["user_id"], "role": user_info["role"]}


# ============================================================================
# Run Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug
    )
