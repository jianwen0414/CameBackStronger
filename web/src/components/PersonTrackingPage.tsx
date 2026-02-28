/**
 * JagaJaga Web - Person Tracking Page
 * Shows cross-camera movement timeline for a weapon holder (ReID).
 * Displays chronological sightings with camera details and evidence videos.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Camera, Clock, MapPin, Play, AlertTriangle,
    Footprints, Video, Loader2, Shield, User,
} from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface Sighting {
    id: string;
    activity_type: string;
    evidence_video_url: string | null;
    detected_at: string;
    is_active: boolean;
    person_id: number;
    location_id: string | null;
    location_name: string | null;
    camera_name: string | null;
    camera_lat: number | null;
    camera_long: number | null;
    camera_altitude: number | null;
}

interface TrackData {
    person_id: number;
    sighting_count: number;
    photo_url: string | null;
    snapshot_url: string | null;
    weapon_type: string;
    sightings: Sighting[];
}

export default function PersonTrackingPage() {
    const { trackingPersonId, closeTracking } = useAlertStore();
    const [data, setData] = useState<TrackData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

    useEffect(() => {
        if (!trackingPersonId) return;
        setIsLoading(true);
        setError(null);
        fetch(`${BACKEND_URL}/reid/track/${trackingPersonId}`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((d: TrackData) => setData(d))
            .catch(err => setError(err.message))
            .finally(() => setIsLoading(false));
    }, [trackingPersonId]);

    // Keyboard escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeTracking();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [closeTracking]);

    if (!trackingPersonId) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md overflow-y-auto"
            >
                {/* Header */}
                <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-orange-500/20">
                    <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={closeTracking}
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-400" />
                            </button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Footprints className="w-5 h-5 text-orange-400" />
                                    <h1 className="text-lg font-bold text-white tracking-tight">
                                        Movement Tracking
                                    </h1>
                                </div>
                                <p className="text-xs text-orange-400 font-mono mt-0.5">
                                    Person #{trackingPersonId}
                                </p>
                            </div>
                        </div>
                        {data && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                                <Camera className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-xs font-mono text-orange-300">
                                    {data.sighting_count} sighting{data.sighting_count !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-4xl mx-auto px-6 py-8">
                    {/* Loading */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                            <p className="text-sm text-gray-400 font-mono">Loading tracking data…</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                            <p className="text-sm text-red-400 font-mono">{error}</p>
                            <button
                                onClick={closeTracking}
                                className="text-xs text-gray-400 hover:text-white transition-colors"
                            >
                                Go back
                            </button>
                        </div>
                    )}

                    {/* Empty */}
                    {data && data.sighting_count === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Footprints className="w-8 h-8 text-gray-600" />
                            <p className="text-sm text-gray-500 font-mono">No tracking data available</p>
                        </div>
                    )}

                    {/* Timeline */}
                    {data && data.sighting_count > 0 && (
                        <div className="space-y-8">
                            {/* ── Person / Weapon profile card ─────────────────── */}
                            <motion.div
                                initial={{ opacity: 0, y: -12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex gap-4 p-4 rounded-2xl border border-orange-500/20 bg-orange-500/5"
                            >
                                {/* Person photo */}
                                <div className="flex-shrink-0">
                                    {data.photo_url ? (
                                        <img
                                            src={data.photo_url}
                                            alt={`Person #${data.person_id}`}
                                            className="w-24 h-32 object-cover rounded-xl border border-orange-500/30"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`w-24 h-32 flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 ${data.photo_url ? 'hidden' : ''}`}>
                                        <User className="w-8 h-8 text-gray-600" />
                                        <span className="text-[10px] text-gray-600 mt-1 font-mono">No photo</span>
                                    </div>
                                </div>

                                {/* Snapshot (person + weapon context) */}
                                {data.snapshot_url && (
                                    <div className="flex-shrink-0">
                                        <img
                                            src={data.snapshot_url}
                                            alt="Weapon context"
                                            className="h-32 rounded-xl border border-red-500/30 object-cover"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex flex-col justify-between min-w-0">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                                                GID #{data.person_id}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Shield className="w-4 h-4 text-red-400 flex-shrink-0" />
                                            <span className="text-sm font-bold text-red-300 uppercase tracking-wide">
                                                {data.weapon_type}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 font-mono">
                                            First detected at {new Date(data.sightings[0].detected_at).toLocaleTimeString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Camera className="w-3.5 h-3.5 text-orange-400" />
                                        <span className="text-xs font-mono text-orange-300">
                                            {data.sighting_count} camera{data.sighting_count !== 1 ? 's' : ''} spotted
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* ── Timeline ─────────────────────────────────────── */}
                            <div className="relative">
                                {/* Vertical line */}
                                <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-orange-500/40 via-orange-500/20 to-transparent" />
                                <div className="space-y-6">
                                    {data.sightings.map((sighting, index) => (
                                        <TimelineEntry
                                            key={sighting.id}
                                            sighting={sighting}
                                            index={index}
                                            total={data.sighting_count}
                                            isVideoExpanded={expandedVideo === sighting.id}
                                            onToggleVideo={() =>
                                                setExpandedVideo(prev =>
                                                    prev === sighting.id ? null : sighting.id
                                                )
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

// ============================================================================
// Timeline Entry
// ============================================================================

function TimelineEntry({
    sighting,
    index,
    total,
    isVideoExpanded,
    onToggleVideo,
}: {
    sighting: Sighting;
    index: number;
    total: number;
    isVideoExpanded: boolean;
    onToggleVideo: () => void;
}) {
    const time = new Date(sighting.detected_at);
    const isFirst = index === 0;
    const isLast = index === total - 1;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className="relative pl-14"
        >
            {/* Timeline dot */}
            <div className={`absolute left-[18px] w-4 h-4 rounded-full border-2 ${
                isFirst
                    ? 'bg-orange-500 border-orange-400 shadow-lg shadow-orange-500/30'
                    : isLast
                        ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/30'
                        : 'bg-neutral-800 border-orange-500/50'
            }`} />

            {/* Card */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 hover:border-orange-500/20 transition-colors overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 flex items-start justify-between">
                    <div className="flex-1">
                        {/* Camera name */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <Camera className="w-4 h-4 text-orange-400" />
                            <span className="text-sm font-semibold text-white">
                                {sighting.camera_name || sighting.location_id || 'Unknown Camera'}
                            </span>
                            {isFirst && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-mono border border-orange-500/20">
                                    FIRST SEEN
                                </span>
                            )}
                            {isLast && total > 1 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-mono border border-red-500/20">
                                    LAST SEEN
                                </span>
                            )}
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-4 text-[11px] text-gray-500 font-mono">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {time.toLocaleString()}
                            </span>
                            {sighting.location_name && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {sighting.location_name}
                                </span>
                            )}
                            {sighting.camera_lat != null && sighting.camera_long != null && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {sighting.camera_lat.toFixed(4)}, {sighting.camera_long.toFixed(4)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Activity type badge */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                        <span className="text-[11px] font-mono font-bold text-red-400 uppercase">
                            {sighting.activity_type}
                        </span>
                    </div>
                </div>

                {/* Evidence video toggle */}
                {sighting.evidence_video_url && (
                    <>
                        <button
                            onClick={onToggleVideo}
                            className="w-full px-5 py-2.5 flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-white hover:bg-white/[0.03] transition-colors border-t border-white/5"
                        >
                            {isVideoExpanded ? (
                                <Video className="w-3.5 h-3.5 text-orange-400" />
                            ) : (
                                <Play className="w-3.5 h-3.5" />
                            )}
                            {isVideoExpanded ? 'Hide Evidence Video' : 'Show Evidence Video'}
                        </button>

                        <AnimatePresence>
                            {isVideoExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-5 pb-4">
                                        <video
                                            src={sighting.evidence_video_url}
                                            controls
                                            className="w-full rounded-xl border border-white/5"
                                            preload="metadata"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </motion.div>
    );
}
