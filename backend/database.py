"""
NightWalk Database Layer
Supabase client and PostGIS query utilities.
"""
from supabase import create_client, Client
from functools import lru_cache
from typing import Optional
import math

from config import get_settings


@lru_cache
def get_supabase_client() -> Client:
    """Get cached Supabase client instance."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


def get_supabase_auth_client() -> Client:
    """Get Supabase client for auth operations (uses anon key)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)


# ============================================================================
# PostGIS Helpers
# ============================================================================

def make_point_wkt(lat: float, long: float) -> str:
    """Create WKT Point string for PostGIS. Uses SRID 4326 (WGS84)."""
    return f"SRID=4326;POINT({long} {lat})"


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate bearing from point 1 to point 2 in degrees.
    Returns 0-360 where 0 is North, 90 is East.
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    
    x = math.sin(delta_lon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lon)
    
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points in meters.
    """
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


# ============================================================================
# Database Operations
# ============================================================================

async def insert_immediate_danger(
    lat: float,
    long: float,
    activity_type: str,
    evidence_url: str
) -> dict:
    """Insert a new immediate danger log entry."""
    client = get_supabase_client()
    
    # PostGIS point format
    point = make_point_wkt(lat, long)
    
    result = client.table("immediate_danger_logs").insert({
        "coordinates": point,
        "activity_type": activity_type,
        "evidence_video_url": evidence_url,
        "is_active": True
    }).execute()
    
    return result.data[0] if result.data else {}


async def insert_suspicious_log(
    lat: float,
    long: float,
    evidence_url: str,
    person_id_hash: Optional[str] = None,
    location_id: Optional[str] = None
) -> dict:
    """Insert a new suspicious individual log entry."""
    client = get_supabase_client()
    
    point = make_point_wkt(lat, long)
    
    data = {
        "coordinates": point,
        "evidence_video_url": evidence_url,
        "status": "pending"
    }
    
    if person_id_hash:
        data["person_id_hash"] = person_id_hash
    if location_id:
        data["location_id"] = location_id
    
    result = client.table("suspicious_individual_logs").insert(data).execute()
    
    return result.data[0] if result.data else {}


async def find_nearby_hazards(
    lat: float,
    long: float,
    radius_meters: float
) -> list[dict]:
    """
    Find all hazards within radius using PostGIS ST_DWithin.
    Returns combined results from both immediate_danger_logs and suspicious_individual_logs.
    """
    client = get_supabase_client()
    
    # PostGIS query using ST_DWithin for efficient spatial search
    # ST_DWithin uses meters when geography type is used
    hazards = []
    
    # Query immediate dangers
    immediate_result = client.rpc(
        "find_immediate_dangers_nearby",
        {
            "query_lat": lat,
            "query_long": long,
            "radius_m": radius_meters
        }
    ).execute()
    
    if immediate_result.data:
        for row in immediate_result.data:
            hazards.append({
                "id": row["id"],
                "lat": row["lat"],
                "long": row["long"],
                "type": row["activity_type"],
                "is_immediate": True,
                "detected_at": row["detected_at"],
                "evidence_url": row.get("evidence_video_url"),
                "distance": haversine_distance(lat, long, row["lat"], row["long"]),
                "bearing": calculate_bearing(lat, long, row["lat"], row["long"])
            })
    
    # Query suspicious logs
    suspicious_result = client.rpc(
        "find_suspicious_nearby",
        {
            "query_lat": lat,
            "query_long": long,
            "radius_m": radius_meters
        }
    ).execute()
    
    if suspicious_result.data:
        for row in suspicious_result.data:
            hazards.append({
                "id": row["id"],
                "lat": row["lat"],
                "long": row["long"],
                "type": "suspicious",
                "is_immediate": False,
                "detected_at": row["detected_at"],
                "evidence_url": row.get("evidence_video_url"),
                "distance": haversine_distance(lat, long, row["lat"], row["long"]),
                "bearing": calculate_bearing(lat, long, row["lat"], row["long"])
            })
    
    # Sort by distance
    hazards.sort(key=lambda x: x["distance"])
    
    return hazards


async def get_all_alerts(limit: int = 100) -> dict:
    """Get all alerts for dashboard display."""
    client = get_supabase_client()
    
    immediate = client.table("immediate_danger_logs")\
        .select("*")\
        .order("detected_at", desc=True)\
        .limit(limit)\
        .execute()
    
    suspicious = client.table("suspicious_individual_logs")\
        .select("*")\
        .order("detected_at", desc=True)\
        .limit(limit)\
        .execute()
    
    return {
        "immediate_dangers": immediate.data or [],
        "suspicious_logs": suspicious.data or []
    }


async def verify_user_token(access_token: str) -> Optional[dict]:
    """Verify Supabase JWT and return user info."""
    client = get_supabase_auth_client()
    
    try:
        # Get user from token
        user_response = client.auth.get_user(access_token)
        
        if user_response and user_response.user:
            user_id = user_response.user.id
            
            # Get user profile with role
            profile = client.table("profiles")\
                .select("role")\
                .eq("id", user_id)\
                .single()\
                .execute()
            
            return {
                "user_id": user_id,
                "role": profile.data.get("role", "citizen") if profile.data else "citizen"
            }
    except Exception:
        return None
    
    return None
