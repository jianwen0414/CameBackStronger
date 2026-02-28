"""
NightWalk Backend - FastAPI Application
Urban Safety Ecosystem API for IoT cameras, mobile AR, and web dashboard.
"""
from fastapi import FastAPI, HTTPException, Query, Depends, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated
import logging
import httpx
import os

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
    get_supabase_client,
    get_person_track,
    update_cctv_stream_url,
    update_danger_evidence_url,
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

# Serve edge evidence clips for dev
_edge_evidence = os.path.join(os.path.dirname(__file__), "..", "edge", "evidence")
if os.path.isdir(_edge_evidence):
    app.mount("/evidence", StaticFiles(directory=_edge_evidence), name="evidence")
_edge_clips = os.path.join(os.path.dirname(__file__), "..", "edge", "clips")
if os.path.isdir(_edge_clips):
    app.mount("/clips", StaticFiles(directory=_edge_clips), name="clips")


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
                evidence_url=alert.gcs_url,
                person_id_hash=alert.person_id_hash,
                location_id=alert.location_id
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
                altitude=c.get("altitude"),
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
            altitude=camera.altitude,
        )
        return {"success": True, "camera_id": result.get("id", "unknown"), "message": "CCTV camera registered"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register CCTV camera: {str(e)}")


@app.patch("/cctv/cameras/{camera_name}", tags=["CCTV"])
async def patch_cctv_camera(camera_name: str, body: dict):
    """Update stream_url for an existing CCTV camera."""
    stream_url = body.get("stream_url")
    try:
        result = await update_cctv_stream_url(camera_name, stream_url)
        return {"success": True, "camera": result}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.patch("/alerts/danger/{alert_id}/evidence", tags=["Alerts"])
async def patch_danger_evidence(alert_id: str, body: dict):
    """Update evidence_video_url for an immediate danger log after recording finishes."""
    url = body.get("evidence_url")
    if not url:
        raise HTTPException(status_code=400, detail="evidence_url required")
    try:
        result = await update_danger_evidence_url(alert_id, url)
        return {"success": True, "alert": result}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


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


@app.get("/cctv/elevation", tags=["CCTV"])
async def get_elevation(
    lat: Annotated[float, Query(ge=-90, le=90)],
    long: Annotated[float, Query(ge=-180, le=180)],
    settings: Settings = Depends(get_settings),
):
    """Proxy Google Elevation API — returns terrain altitude in metres for a lat/long."""
    if not settings.google_maps_api_key:
        raise HTTPException(status_code=503, detail="GOOGLE_MAPS_API_KEY not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/elevation/json",
                params={"locations": f"{lat},{long}", "key": settings.google_maps_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
        if data.get("status") != "OK" or not data.get("results"):
            raise HTTPException(status_code=502, detail=f"Elevation API error: {data.get('status')}")
        return {"elevation": round(data["results"][0]["elevation"], 2)}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Elevation API request failed: {str(e)}")


# ============================================================================
# ReID Person Tracking Endpoints
# ============================================================================

@app.get("/reid/track/{person_id}", tags=["ReID"])
async def track_person(person_id: int):
    """
    Get cross-camera movement timeline for a weapon holder.
    Returns chronological list of sightings with camera details and evidence videos.
    Includes photo_url and snapshot_url derived from edge-saved images.
    """
    try:
        sightings = await get_person_track(person_id)
        base = os.getenv("BACKEND_URL", "http://localhost:8000")
        # Derive photo URLs from person_id (saved by edge on first appearance)
        photo_url = f"{base}/evidence/person_{person_id}.jpg"
        snapshot_url = f"{base}/evidence/snapshot_{person_id}.jpg"
        # Infer weapon type from first sighting
        weapon_type = sightings[0].get("activity_type", "weapon") if sightings else "weapon"
        return {
            "person_id": person_id,
            "sighting_count": len(sightings),
            "photo_url": photo_url,
            "snapshot_url": snapshot_url,
            "weapon_type": weapon_type,
            "sightings": sightings,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tracking data: {str(e)}")


# ============================================================================
# User Crime Report Endpoints
# ============================================================================

@app.post("/reports/upload", tags=["Reports"])
async def upload_evidence_video(
    file: UploadFile = File(...)
):
    """
    Upload an evidence video file directly to the backend.
    
    The backend uses the service key to bypass Row Level Security 
    and uploads the video to Supabase Storage, returning the public URL.
    """
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
            
        file_ext = file.filename.split(".")[-1] if "." in file.filename else "mp4"
        import uuid
        import time
        safe_filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}.{file_ext}"
        
        # Read file contents
        file_bytes = await file.read()
        
        client = get_supabase_client()
        
        # Upload to supabase storage using service key
        res = client.storage.from_("evidence-videos").upload(
            file=file_bytes,
            path=safe_filename,
            file_options={"content-type": file.content_type}
        )
        
        # Get public URL
        public_url = client.storage.from_("evidence-videos").get_public_url(safe_filename)
        
        return {"success": True, "evidence_video_url": public_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")


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
