"""
NightWalk Backend - FastAPI Application
Urban Safety Ecosystem API for IoT cameras, mobile AR, and web dashboard.
"""
from fastapi import FastAPI, HTTPException, Query, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated
import logging

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
    UserRole,
    UserReportCrimeRequest,
    ReportCreatedResponse,
    CCTVCreateRequest,
    CCTVCameraResponse,
    CCTVCamerasListResponse,
    UserReportedCrimeResponse,
    UserReportedCrimesListResponse,
)
from database import (
    insert_immediate_danger,
    insert_suspicious_log,
    find_nearby_hazards,
    get_all_alerts,
    verify_user_token,
    get_all_cctv_cameras,
    insert_cctv_camera,
    find_nearby_cctv,
    insert_user_reported_crime,
    get_all_reported_crimes,
    find_nearby_reported_crimes,
    update_crime_report_validation,
)
from validation_pipeline import process_crime_report

# Configure logging for the AI pipeline
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
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
                evidence_url=h.get("evidence_url"),
                beacon_kind=h.get("beacon_kind", "immediate" if h["is_immediate"] else "suspicious"),
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
# CCTV Camera Endpoints
# ============================================================================

@app.get("/cctv/cameras", response_model=CCTVCamerasListResponse, tags=["CCTV"])
async def list_cctv_cameras():
    """
    Get all active CCTV cameras for the web dashboard.
    Each CCTV camera corresponds to a blue beacon on the God View.
    """
    try:
        cameras = await get_all_cctv_cameras()
        camera_list = [
            CCTVCameraResponse(
                id=str(c.get("id", "")),
                camera_name=c.get("camera_name", ""),
                location_name=c.get("location_name"),
                lat=c.get("lat", 0),
                long=c.get("long", 0),
                stream_url=c.get("stream_url"),
                is_active=c.get("is_active", True),
                last_heartbeat=c.get("last_heartbeat"),
            )
            for c in cameras
        ]
        return CCTVCamerasListResponse(cameras=camera_list, total_count=len(camera_list))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch CCTV cameras: {str(e)}")


@app.post("/cctv/cameras", tags=["CCTV"])
async def create_cctv_camera(camera: CCTVCreateRequest):
    """Register a new CCTV camera."""
    try:
        result = await insert_cctv_camera(
            camera_name=camera.camera_name,
            lat=camera.lat,
            long=camera.long,
            location_name=camera.location_name,
            stream_url=camera.stream_url,
            zone_id=camera.zone_id,
        )
        return {"success": True, "camera_id": result.get("id", "unknown"), "message": "CCTV camera registered"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register CCTV camera: {str(e)}")


@app.get("/cctv/nearby", tags=["CCTV"])
async def get_nearby_cctv(
    lat: Annotated[float, Query(ge=-90, le=90)],
    long: Annotated[float, Query(ge=-180, le=180)],
    radius: Annotated[float, Query(gt=0, le=5000)] = 2000.0
):
    """Find CCTV cameras within specified radius."""
    try:
        cameras = await find_nearby_cctv(lat, long, radius)
        return {"cameras": cameras, "total_count": len(cameras)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to find nearby CCTV: {str(e)}")


# ============================================================================
# User Crime Report Endpoints
# ============================================================================

@app.post("/reports/crime", response_model=ReportCreatedResponse, tags=["Reports"])
async def submit_crime_report(
    report: UserReportCrimeRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit a user-reported crime from the mobile app.
    
    The report will be created with 'pending' status and immediately
    queued for async validation via the VideoMAE + Gemini AI pipeline.
    The citizen receives an instant response while processing runs in background.
    """
    try:
        result = await insert_user_reported_crime(
            lat=report.lat,
            long=report.long,
            crime_type=report.crime_type.value,
            evidence_video_url=report.evidence_video_url,
            reporter_id=report.reporter_id,
            description=report.description,
            video_duration_seconds=report.video_duration_seconds,
        )
        
        report_id = str(result.get("id", "unknown"))
        
        # Trigger the async AI validation pipeline (VideoMAE + Gemini)
        background_tasks.add_task(
            process_crime_report,
            report_id=report_id,
            evidence_video_url=report.evidence_video_url,
            user_reported_type=report.crime_type.value,
            description=report.description,
        )
        
        return ReportCreatedResponse(
            success=True,
            report_id=report_id,
            message=(
                f"Crime report submitted. Type: {report.crime_type.value}. "
                f"AI validation pipeline started — video classification and "
                f"Gemini analysis running in background."
            ),
            validation_status="pending"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit crime report: {str(e)}")


@app.get("/reports/crimes", response_model=UserReportedCrimesListResponse, tags=["Reports"])
async def list_reported_crimes(
    include_all: Annotated[bool, Query(description="Include all statuses (True for web, False for mobile)")] = True,
    limit: Annotated[int, Query(ge=1, le=500)] = 100
):
    """
    Get user-reported crimes.
    
    - Web dashboard (include_all=True): Returns all reports regardless of status
    - Mobile app (include_all=False): Returns only validated reports (purple beacons)
    """
    try:
        reports = await get_all_reported_crimes(include_all=include_all, limit=limit)
        report_list = [
            UserReportedCrimeResponse(
                id=str(r.get("id", "")),
                reporter_id=str(r.get("reporter_id", "")) if r.get("reporter_id") else None,
                lat=r.get("lat", 0),
                long=r.get("long", 0),
                crime_type=r.get("crime_type", ""),
                description=r.get("description"),
                evidence_video_url=r.get("evidence_video_url", ""),
                classified_crime_type=r.get("classified_crime_type"),
                classification_confidence=r.get("classification_confidence"),
                gemini_analysis=r.get("gemini_analysis"),
                gemini_justification=r.get("gemini_justification"),
                validation_status=r.get("validation_status", "pending"),
                reported_at=r.get("reported_at", datetime.utcnow()),
            )
            for r in reports
        ]
        return UserReportedCrimesListResponse(reports=report_list, total_count=len(report_list))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch crime reports: {str(e)}")


@app.get("/reports/nearby", tags=["Reports"])
async def get_nearby_reported_crimes(
    lat: Annotated[float, Query(ge=-90, le=90)],
    long: Annotated[float, Query(ge=-180, le=180)],
    radius: Annotated[float, Query(gt=0, le=5000)] = 2000.0,
    include_all: Annotated[bool, Query()] = False
):
    """Find user-reported crimes within specified radius."""
    try:
        reports = await find_nearby_reported_crimes(lat, long, radius, include_all)
        return {"reports": reports, "total_count": len(reports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to find nearby reports: {str(e)}")


@app.patch("/reports/crime/{report_id}/validate", tags=["Reports"])
async def validate_crime_report(
    report_id: str,
    validation_status: str = Query(..., description="New validation status"),
    classified_crime_type: str = Query(None),
    classification_confidence: float = Query(None),
    gemini_analysis: str = Query(None),
    gemini_justification: str = Query(None),
):
    """
    Update a crime report with validation results.
    Called by the video classification pipeline or admin review.
    """
    try:
        result = await update_crime_report_validation(
            report_id=report_id,
            validation_status=validation_status,
            classified_crime_type=classified_crime_type,
            classification_confidence=classification_confidence,
            gemini_analysis=gemini_analysis,
            gemini_justification=gemini_justification,
        )
        return {"success": True, "report_id": report_id, "validation_status": validation_status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to validate report: {str(e)}")


@app.post("/reports/crime/{report_id}/revalidate", tags=["Reports"])
async def revalidate_crime_report(
    report_id: str,
    background_tasks: BackgroundTasks,
):
    """
    Re-run the AI validation pipeline on an existing crime report.
    Useful for admin re-assessment or after pipeline errors.
    """
    try:
        # Fetch the report to get its details
        reports = await get_all_reported_crimes(include_all=True, limit=500)
        report = next((r for r in reports if str(r.get("id")) == report_id), None)
        
        if not report:
            raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
        
        # Queue re-validation
        background_tasks.add_task(
            process_crime_report,
            report_id=report_id,
            evidence_video_url=report.get("evidence_video_url", ""),
            user_reported_type=report.get("crime_type", "unknown"),
            description=report.get("description"),
        )
        
        return {
            "success": True,
            "report_id": report_id,
            "message": "Re-validation pipeline started in background.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to re-validate: {str(e)}")


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
