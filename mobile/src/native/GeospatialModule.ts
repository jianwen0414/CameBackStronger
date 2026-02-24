/**
 * NightWalk Mobile - Geospatial Module TypeScript Wrapper
 * Type-safe interface for the native Kotlin module
 */
import { NativeModules } from 'react-native';

interface GeospatialPose {
    latitude: number;
    longitude: number;
    altitude?: number;
    heading: number;
    horizontalAccuracy: number;
    verticalAccuracy?: number;
    headingAccuracy?: number;
}

interface TrackingResult {
    trackingState: 'TRACKING' | 'PAUSED' | 'STOPPED';
    isTracking: boolean;
    earthState?: string;
    failureReason?: string;
    latitude?: number;
    longitude?: number;
    altitude?: number;
    heading?: number;
    horizontalAccuracy?: number;
    verticalAccuracy?: number;
    headingAccuracy?: number;
}

interface AnchorResult {
    distanceMeters: number;
    bearingDegrees: number;
    relativeBearingDegrees: number;
    elevationAngleDegrees: number;
    isInFront: boolean;
    accuracy: number;
    devicePose: {
        latitude: number;
        longitude: number;
        heading: number;
    };
    targetPosition: {
        latitude: number;
        longitude: number;
    };
}

interface InitResult {
    success: boolean;
    message: string;
}

interface VpsCheckResult {
    status: string;
    message: string;
}

interface GeospatialModuleType {
    initialize(): Promise<InitResult>;
    startTracking(): Promise<{ success: boolean }>;
    stopTracking(): Promise<{ success: boolean }>;
    getTrackingState(): Promise<TrackingResult>;
    getGeospatialAnchor(lat: number, lng: number): Promise<AnchorResult>;
    checkVpsAvailability(lat: number, lng: number): Promise<VpsCheckResult>;
    destroy(): Promise<{ success: boolean }>;
}

const { GeospatialModule } = NativeModules;

export default GeospatialModule as GeospatialModuleType;
export type {
    GeospatialPose,
    TrackingResult,
    AnchorResult,
    InitResult,
    VpsCheckResult
};
