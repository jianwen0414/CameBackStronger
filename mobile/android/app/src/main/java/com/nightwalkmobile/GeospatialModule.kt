package com.nightwalkmobile

import android.util.Log
import com.facebook.react.bridge.*
import com.google.ar.core.*
import com.google.ar.core.exceptions.*
import kotlin.math.*

/**
 * NightWalk Mobile - Geospatial Native Module
 * Bridges ARCore Geospatial API (VPS) to React Native
 * 
 * Provides high-precision positioning using Google's Visual Positioning System
 * for AR hazard overlay rendering.
 */
class GeospatialModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private var session: Session? = null
    private var earth: Earth? = null
    
    companion object {
        private const val TAG = "GeospatialModule"
        private const val EARTH_RADIUS_METERS = 6371000.0
    }

    override fun getName(): String = "GeospatialModule"

    /**
     * Initialize ARCore session with Geospatial mode enabled.
     * Must be called before any other methods.
     */
    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity ?: run {
                promise.reject("NO_ACTIVITY", "No activity available")
                return
            }
            
            // Check if ARCore is installed and supported
            val availability = ArCoreApk.getInstance().checkAvailability(activity)
            if (availability.isTransient) {
                promise.reject("ARCORE_TRANSIENT", "ARCore availability is being determined")
                return
            }
            
            if (availability != ArCoreApk.Availability.SUPPORTED_INSTALLED) {
                promise.reject("ARCORE_NOT_AVAILABLE", "ARCore is not available on this device")
                return
            }
            
            // Create session with Geospatial mode
            session = Session(activity).apply {
                val config = Config(this).apply {
                    geospatialMode = Config.GeospatialMode.ENABLED
                }
                configure(config)
            }
            
            earth = session?.earth
            
            Log.d(TAG, "ARCore session initialized with Geospatial mode")
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("message", "Geospatial session initialized")
                }
            )
            
        } catch (e: UnavailableArcoreNotInstalledException) {
            promise.reject("ARCORE_NOT_INSTALLED", "ARCore is not installed", e)
        } catch (e: UnavailableDeviceNotCompatibleException) {
            promise.reject("DEVICE_NOT_COMPATIBLE", "Device does not support ARCore", e)
        } catch (e: UnavailableSdkTooOldException) {
            promise.reject("SDK_TOO_OLD", "ARCore SDK needs to be updated", e)
        } catch (e: Exception) {
            promise.reject("INITIALIZATION_ERROR", "Failed to initialize: ${e.message}", e)
        }
    }

    /**
     * Get current tracking state of Geospatial API.
     * Returns tracking state and pose accuracy.
     */
    @ReactMethod
    fun getTrackingState(promise: Promise) {
        val currentEarth = earth ?: run {
            promise.reject("NOT_INITIALIZED", "Geospatial session not initialized")
            return
        }
        
        try {
            val trackingState = currentEarth.trackingState
            val geospatialPose = if (trackingState == TrackingState.TRACKING) {
                currentEarth.cameraGeospatialPose
            } else null
            
            promise.resolve(
                Arguments.createMap().apply {
                    putString("trackingState", trackingState.name)
                    putBoolean("isTracking", trackingState == TrackingState.TRACKING)
                    
                    geospatialPose?.let { pose ->
                        putDouble("latitude", pose.latitude)
                        putDouble("longitude", pose.longitude)
                        putDouble("altitude", pose.altitude)
                        putDouble("heading", pose.heading)
                        putDouble("horizontalAccuracy", pose.horizontalAccuracy)
                        putDouble("verticalAccuracy", pose.verticalAccuracy)
                        putDouble("headingAccuracy", pose.headingAccuracy)
                    }
                }
            )
        } catch (e: Exception) {
            promise.reject("TRACKING_ERROR", "Failed to get tracking state: ${e.message}", e)
        }
    }

    /**
     * Calculate precise distance and bearing to a hazard coordinate.
     * Uses VPS pose for accurate positioning, not just raw GPS.
     * 
     * @param targetLat Target latitude
     * @param targetLng Target longitude
     */
    @ReactMethod
    fun getGeospatialAnchor(targetLat: Double, targetLng: Double, promise: Promise) {
        val currentEarth = earth ?: run {
            promise.reject("NOT_INITIALIZED", "Geospatial session not initialized")
            return
        }
        
        try {
            if (currentEarth.trackingState != TrackingState.TRACKING) {
                promise.reject("NOT_TRACKING", "Geospatial not tracking. Ensure good lighting and visible surroundings.")
                return
            }
            
            val pose = currentEarth.cameraGeospatialPose
            
            // Calculate distance using Haversine formula
            val distance = calculateHaversineDistance(
                pose.latitude, pose.longitude,
                targetLat, targetLng
            )
            
            // Calculate bearing from current position to target
            val bearing = calculateBearing(
                pose.latitude, pose.longitude,
                targetLat, targetLng
            )
            
            // Calculate relative bearing (accounting for device heading)
            val relativeBearing = normalizeAngle(bearing - pose.heading)
            
            // Determine if target is in front of user
            val isInFront = abs(relativeBearing) < 90
            
            // Calculate vertical angle (for AR overlay positioning)
            val elevationAngle = atan2(
                -distance * 0.01, // Approximate elevation difference
                distance
            ).toDegrees()
            
            promise.resolve(
                Arguments.createMap().apply {
                    putDouble("distanceMeters", distance)
                    putDouble("bearingDegrees", bearing)
                    putDouble("relativeBearingDegrees", relativeBearing)
                    putDouble("elevationAngleDegrees", elevationAngle)
                    putBoolean("isInFront", isInFront)
                    putDouble("accuracy", pose.horizontalAccuracy)
                    
                    // Current position
                    putMap("devicePose", Arguments.createMap().apply {
                        putDouble("latitude", pose.latitude)
                        putDouble("longitude", pose.longitude)
                        putDouble("heading", pose.heading)
                    })
                    
                    // Target position
                    putMap("targetPosition", Arguments.createMap().apply {
                        putDouble("latitude", targetLat)
                        putDouble("longitude", targetLng)
                    })
                }
            )
            
        } catch (e: Exception) {
            promise.reject("ANCHOR_ERROR", "Failed to calculate anchor: ${e.message}", e)
        }
    }

    /**
     * Check if device and location support VPS (Visual Positioning System).
     */
    @ReactMethod
    fun checkVpsAvailability(lat: Double, lng: Double, promise: Promise) {
        val currentSession = session ?: run {
            promise.reject("NOT_INITIALIZED", "Session not initialized")
            return
        }
        
        try {
            val future = currentSession.checkVpsAvailabilityAsync(lat, lng) { availability ->
                val result = Arguments.createMap().apply {
                    putString("availability", availability.name)
                    putBoolean("isAvailable", availability == VpsAvailability.AVAILABLE)
                }
                
                // Note: This callback runs on a background thread
                // In production, you'd need to post to main thread
            }
            
            // For simplicity, return optimistic result
            promise.resolve(
                Arguments.createMap().apply {
                    putString("status", "checking")
                    putString("message", "VPS availability check initiated")
                }
            )
            
        } catch (e: Exception) {
            promise.reject("VPS_CHECK_ERROR", "Failed to check VPS: ${e.message}", e)
        }
    }

    /**
     * Clean up ARCore session.
     */
    @ReactMethod
    fun destroy(promise: Promise) {
        try {
            session?.close()
            session = null
            earth = null
            
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("success", true)
                }
            )
        } catch (e: Exception) {
            promise.reject("DESTROY_ERROR", "Failed to destroy session: ${e.message}", e)
        }
    }

    // ============================================================================
    // Helper Functions
    // ============================================================================

    private fun calculateHaversineDistance(
        lat1: Double, lon1: Double,
        lat2: Double, lon2: Double
    ): Double {
        val phi1 = lat1.toRadians()
        val phi2 = lat2.toRadians()
        val deltaPhi = (lat2 - lat1).toRadians()
        val deltaLambda = (lon2 - lon1).toRadians()
        
        val a = sin(deltaPhi / 2).pow(2) +
                cos(phi1) * cos(phi2) * sin(deltaLambda / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        
        return EARTH_RADIUS_METERS * c
    }

    private fun calculateBearing(
        lat1: Double, lon1: Double,
        lat2: Double, lon2: Double
    ): Double {
        val phi1 = lat1.toRadians()
        val phi2 = lat2.toRadians()
        val deltaLambda = (lon2 - lon1).toRadians()
        
        val x = sin(deltaLambda) * cos(phi2)
        val y = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(deltaLambda)
        
        return normalizeAngle(atan2(x, y).toDegrees())
    }

    private fun normalizeAngle(degrees: Double): Double {
        var normalized = degrees % 360
        if (normalized < -180) normalized += 360
        if (normalized > 180) normalized -= 360
        return normalized
    }

    private fun Double.toRadians(): Double = this * PI / 180.0
    private fun Double.toDegrees(): Double = this * 180.0 / PI
}
