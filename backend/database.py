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
    evidence_url: str,
    location_name: Optional[str] = None
) -> dict:
    """
    Insert a new immediate danger log entry.
    
    Args:
        lat: Latitude
        long: Longitude
        activity_type: Type of danger (fight, weapon, robbery, fall)
        evidence_url: URL to evidence video
        location_name: Optional location name/description
    
    Returns:
        Dictionary containing the inserted record
    
    Raises:
        Exception: If database operation fails
    """
    client = get_supabase_client()
    
    # PostGIS point format
    point = make_point_wkt(lat, long)
    
    data = {
        "coordinates": point,
        "activity_type": activity_type,
        "evidence_video_url": evidence_url,
        "is_active": True
    }
    
    if location_name:
        data["location_name"] = location_name
    
    try:
        result = client.table("immediate_danger_logs").insert(data).execute()
        
        if not result.data:
            raise Exception("Insert operation returned no data")
        
        return result.data[0]
    except Exception as e:
        raise Exception(f"Failed to insert immediate danger: {str(e)}")


async def insert_suspicious_log(
    lat: float,
    long: float,
    evidence_url: str,
    person_id_hash: Optional[str] = None,
    location_id: Optional[str] = None,
    location_name: Optional[str] = None
) -> dict:
    """
    Insert a new suspicious individual log entry.
    
    Args:
        lat: Latitude
        long: Longitude
        evidence_url: URL to evidence video
        person_id_hash: Optional hash identifier for the person
        location_id: Optional camera/location identifier
        location_name: Optional location name/description
    
    Returns:
        Dictionary containing the inserted record
    
    Raises:
        Exception: If database operation fails
    """
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
    if location_name:
        data["location_name"] = location_name
    
    try:
        result = client.table("suspicious_individual_logs").insert(data).execute()
        
        if not result.data:
            raise Exception("Insert operation returned no data")
        
        return result.data[0]
    except Exception as e:
        raise Exception(f"Failed to insert suspicious log: {str(e)}")


async def find_nearby_hazards(
    lat: float,
    long: float,
    radius_meters: float
) -> list[dict]:
    """
    Find all hazards within radius using PostGIS ST_DWithin.
    Returns combined results from both immediate_danger_logs and suspicious_individual_logs.
    
    Args:
        lat: Query latitude
        long: Query longitude
        radius_meters: Search radius in meters
    
    Returns:
        List of hazard dictionaries sorted by distance
    
    Raises:
        Exception: If database operation fails
    """
    client = get_supabase_client()
    
    # PostGIS query using ST_DWithin for efficient spatial search
    # ST_DWithin uses meters when geography type is used
    hazards = []
    
    try:
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
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        error_str = str(e)
        
        # Check if it's an API key error
        if "Invalid API key" in error_str or "401" in error_str:
            print("=" * 80)
            print("ERROR: Invalid Supabase API Key")
            print("=" * 80)
            print("The backend is unable to authenticate with Supabase.")
            print("Please check your .env file in the backend directory and ensure:")
            print("  1. SUPABASE_URL is set correctly")
            print("  2. SUPABASE_SERVICE_KEY is set correctly (service_role key, not anon key)")
            print("  3. The service_role key has proper permissions for RPC functions")
            print("=" * 80)
            print(f"Full error: {error_str}")
            print("=" * 80)
            raise Exception(
                "Supabase authentication failed. Please check your SUPABASE_SERVICE_KEY "
                "in the backend .env file. The mobile app uses a different key (anon key) "
                "which is why it works there."
            )
        
        print(f"Error in find_nearby_hazards: {error_str}")
        print(f"Traceback: {error_details}")
        raise Exception(f"Failed to find nearby hazards: {error_str}")


async def get_all_alerts(limit: int = 100) -> dict:
    """
    Get all alerts for dashboard display.
    
    Args:
        limit: Maximum number of alerts to return per type
    
    Returns:
        Dictionary with 'immediate_dangers' and 'suspicious_logs' keys
    
    Raises:
        Exception: If database operation fails
    """
    client = get_supabase_client()
    
    try:
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
    except Exception as e:
        raise Exception(f"Failed to get all alerts: {str(e)}")


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
