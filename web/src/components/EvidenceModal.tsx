/**
 * NightWalk Web - Evidence Modal
 *
 * Beacon logic:
 *   Blue   → CCTV camera in normal state – shows camera info + real-time feed
 *   Red    → CCTV camera that detected immediate danger – shows camera info,
 *            evidence video of the incident, threat details, + "Real-time CCTV" button
 *   Yellow → CCTV camera that detected suspicious behaviour – same as red but
 *            with suspicious-activity details
 *   Purple → User-reported crime (NOT a CCTV) – completely different layout
 *            with report details, AI classification, Gemini analysis
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, AlertTriangle, Clock, MapPin, Play, Camera, Video,
    Users, Brain, CheckCircle, Shield, ChevronRight, Radio,
    Eye, Hash, Crosshair, FileText, Activity, Zap,
    RefreshCw, Loader2, ShieldAlert, TrendingUp,
} from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';
import type {
    ImmediateDanger, SuspiciousLog, CCTVCamera, UserReportedCrime, BeaconType,
} from '../lib/supabase';

// Placeholder CCTV stream when no stream_url is available
const SAMPLE_CCTV_STREAM =
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4';

// ============================================================================
// Style config per beacon type
// ============================================================================

const BEACON_STYLES: Record<BeaconType, {
    border: string;
    shadow: string;
    headerBg: string;
    headerBorder: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    title: string;
    accent: string;
    accentRgb: string;
}> = {
    red: {
        border: 'border-[#ff0040]',
        shadow: 'shadow-[0_0_60px_rgba(255,0,64,0.3)]',
        headerBg: 'bg-gradient-to-r from-[rgba(255,0,64,0.15)] to-transparent',
        headerBorder: 'border-b border-[#ff0040]/40',
        iconBg: 'bg-[rgba(255,0,64,0.15)]',
        iconColor: 'text-[#ff0040]',
        titleColor: 'text-[#ff0040]',
        title: 'Immediate Danger',
        accent: '#ff0040',
        accentRgb: '255,0,64',
    },
    yellow: {
        border: 'border-[#ffcc00]',
        shadow: 'shadow-[0_0_60px_rgba(255,204,0,0.2)]',
        headerBg: 'bg-gradient-to-r from-[rgba(255,204,0,0.1)] to-transparent',
        headerBorder: 'border-b border-[#ffcc00]/40',
        iconBg: 'bg-[rgba(255,204,0,0.15)]',
        iconColor: 'text-[#ffcc00]',
        titleColor: 'text-[#ffcc00]',
        title: 'Suspicious Activity',
        accent: '#ffcc00',
        accentRgb: '255,204,0',
    },
    blue: {
        border: 'border-[#00aaff]',
        shadow: 'shadow-[0_0_60px_rgba(0,170,255,0.25)]',
        headerBg: 'bg-gradient-to-r from-[rgba(0,170,255,0.12)] to-transparent',
        headerBorder: 'border-b border-[#00aaff]/40',
        iconBg: 'bg-[rgba(0,170,255,0.15)]',
        iconColor: 'text-[#00aaff]',
        titleColor: 'text-[#00aaff]',
        title: 'CCTV Camera',
        accent: '#00aaff',
        accentRgb: '0,170,255',
    },
    purple: {
        border: 'border-[#a855f7]',
        shadow: 'shadow-[0_0_60px_rgba(168,85,247,0.25)]',
        headerBg: 'bg-gradient-to-r from-[rgba(168,85,247,0.12)] to-transparent',
        headerBorder: 'border-b border-[#a855f7]/40',
        iconBg: 'bg-[rgba(168,85,247,0.15)]',
        iconColor: 'text-[#a855f7]',
        titleColor: 'text-[#a855f7]',
        title: 'User Reported Crime',
        accent: '#a855f7',
        accentRgb: '168,85,247',
    },
};

function getBeaconIcon(type: BeaconType) {
    switch (type) {
        case 'red': return <AlertTriangle className="w-5 h-5" />;
        case 'yellow': return <Shield className="w-5 h-5" />;
        case 'blue': return <Camera className="w-5 h-5" />;
        case 'purple': return <Users className="w-5 h-5" />;
    }
}

// ============================================================================
// CCTV Stream View — fullscreen live feed overlay
// Accessible from blue (directly) and red/yellow (via "Real-time CCTV" button)
// ============================================================================

function CCTVStreamView({ camera, sourceLabel, onClose }: {
    camera: CCTVCamera | null;
    sourceLabel?: string;
    onClose: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamUrl = camera?.stream_url || SAMPLE_CCTV_STREAM;
    const cameraName = camera?.camera_name || 'Nearest CCTV';
    const locationName = camera?.location_name || sourceLabel || '';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black flex flex-col"
        >
            {/* Stream Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-black/80 border-b border-[#00aaff]/30">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-mono text-red-400 uppercase tracking-wider">Live</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[#00aaff]">{cameraName}</h3>
                        {locationName && (
                            <p className="text-[10px] text-gray-500 font-mono">{locationName}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {camera && (
                        <span className="text-[10px] font-mono text-gray-500">
                            {camera.lat.toFixed(4)}, {camera.long.toFixed(4)}
                        </span>
                    )}
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Video */}
            <div className="flex-1 relative">
                <video ref={videoRef} src={streamUrl} autoPlay loop muted className="w-full h-full object-contain" />
                <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px]" />
                <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-[#00aaff] opacity-40" />
                <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-[#00aaff] opacity-40" />
                <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-[#00aaff] opacity-40" />
                <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-[#00aaff] opacity-40" />
                <div className="absolute bottom-6 left-6 text-[11px] font-mono text-[#00aaff]/60">
                    STREAM // {new Date().toISOString()}
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// Shared: Source Camera Info Bar (compact – shown in red & yellow modals)
// ============================================================================

function SourceCameraBar({ camera, accentRgb }: { camera: CCTVCamera | null; accentRgb: string }) {
    if (!camera) return null;
    return (
        <div
            className="mx-4 mt-4 flex items-center gap-3 rounded-lg px-4 py-3 border"
            style={{
                background: `rgba(${accentRgb},0.04)`,
                borderColor: `rgba(${accentRgb},0.18)`,
            }}
        >
            <div
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ background: `rgba(${accentRgb},0.1)` }}
            >
                <Camera className="w-4 h-4" style={{ color: `rgba(${accentRgb},0.8)` }} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#00aaff]">{camera.camera_name}</span>
                    <span className="text-[10px] font-mono text-gray-500">{camera.location_name || ''}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-[10px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${camera.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className={camera.is_active ? 'text-green-400' : 'text-red-400'}>
                            {camera.is_active ? 'Online' : 'Offline'}
                        </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-600">
                        {camera.lat.toFixed(4)}, {camera.long.toFixed(4)}
                    </span>
                </div>
            </div>
            <Radio className="w-4 h-4 text-gray-600" />
        </div>
    );
}

// ============================================================================
// Evidence Video Player (shared by red, yellow, purple)
// ============================================================================

function EvidenceVideoPlayer({
    url,
    accent,
    videoRef,
}: {
    url: string | null;
    accent: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
    if (!url) {
        return (
            <div className="mx-4 mt-3 aspect-video rounded-lg bg-black/40 border border-white/5 flex items-center justify-center">
                <p className="text-gray-600 font-mono text-sm">No video evidence available</p>
            </div>
        );
    }
    const src = url.startsWith('gs://') ? url.replace('gs://', 'https://storage.googleapis.com/') : url;
    return (
        <div className="mx-4 mt-3 relative aspect-video rounded-lg overflow-hidden bg-black border border-white/5">
            <video ref={videoRef} src={src} controls className="w-full h-full object-contain" />
            <div className="absolute inset-0 pointer-events-none opacity-15 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.12)_50%)] bg-[length:100%_4px]" />
            <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 opacity-40" style={{ borderColor: accent }} />
            <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 opacity-40" style={{ borderColor: accent }} />
            <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 opacity-40" style={{ borderColor: accent }} />
            <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 opacity-40" style={{ borderColor: accent }} />
        </div>
    );
}

// ============================================================================
// Blue Beacon — CCTV Info Panel (no danger, shows camera details + live preview)
// ============================================================================

function CCTVInfoPanel({ camera, onOpenStream }: { camera: CCTVCamera; onOpenStream: () => void }) {
    return (
        <div className="p-5 space-y-4">
            {/* Camera details grid */}
            <div className="grid grid-cols-2 gap-3">
                <InfoCard label="Camera Name" icon={<Camera className="w-3.5 h-3.5" />} accent="#00aaff">
                    <span className="text-base font-bold text-[#00aaff]">{camera.camera_name}</span>
                </InfoCard>
                <InfoCard label="Location" icon={<MapPin className="w-3.5 h-3.5" />} accent="#00aaff">
                    <span className="text-base font-bold">{camera.location_name || 'Unknown'}</span>
                </InfoCard>
                <InfoCard label="Status" icon={<Activity className="w-3.5 h-3.5" />} accent="#00aaff">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${camera.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-sm font-semibold ${camera.is_active ? 'text-green-400' : 'text-red-400'}`}>
                            {camera.is_active ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </InfoCard>
                <InfoCard label="Stream" icon={<Video className="w-3.5 h-3.5" />} accent="#00aaff">
                    <span className="text-sm text-gray-300 truncate block">{camera.stream_url ? 'Available' : 'Default stream'}</span>
                </InfoCard>
            </div>

            {/* Live preview CTA */}
            <button
                onClick={onOpenStream}
                className="w-full aspect-video bg-black/30 rounded-lg border border-[#00aaff]/20 flex flex-col items-center justify-center gap-3 hover:bg-[#00aaff]/5 transition-all cursor-pointer group"
            >
                <div className="w-14 h-14 rounded-full bg-[#00aaff]/10 flex items-center justify-center border border-[#00aaff]/30 group-hover:scale-110 transition-transform">
                    <Video className="w-7 h-7 text-[#00aaff]" />
                </div>
                <span className="text-xs font-mono text-[#00aaff] uppercase tracking-widest">
                    Click to Open Real-time Feed
                </span>
            </button>
        </div>
    );
}

// ============================================================================
// Red Beacon — Threat Details Panel
// ============================================================================

function ThreatDetailsPanel({ danger }: { danger: ImmediateDanger }) {
    const threatLabel: Record<string, string> = {
        fight: 'Active Altercation',
        weapon: 'Weapon Detected',
        robbery: 'Robbery in Progress',
    };

    const threatLevel: Record<string, { label: string; color: string }> = {
        fight: { label: 'HIGH', color: '#ff6b35' },
        weapon: { label: 'CRITICAL', color: '#ff0040' },
        robbery: { label: 'HIGH', color: '#ff6b35' },
    };

    const level = threatLevel[danger.activity_type] || { label: 'UNKNOWN', color: '#ff0040' };

    return (
        <div className="mx-4 mt-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-[#ff0040]" />
                <span className="text-[10px] font-mono text-[#ff0040] uppercase tracking-widest">Threat Intelligence</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <InfoCard label="Activity Type" icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="#ff0040">
                    <span className="text-sm font-bold text-white uppercase">
                        {threatLabel[danger.activity_type] || danger.activity_type}
                    </span>
                </InfoCard>
                <InfoCard label="Threat Level" icon={<Crosshair className="w-3.5 h-3.5" />} accent="#ff0040">
                    <span className="text-sm font-bold" style={{ color: level.color }}>{level.label}</span>
                </InfoCard>
                <InfoCard label="Status" icon={<Activity className="w-3.5 h-3.5" />} accent="#ff0040">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${danger.is_active ? 'bg-[#ff0040] animate-pulse' : 'bg-gray-500'}`} />
                        <span className={`text-sm font-semibold ${danger.is_active ? 'text-[#ff0040]' : 'text-gray-400'}`}>
                            {danger.is_active ? 'Active' : 'Resolved'}
                        </span>
                    </div>
                </InfoCard>
            </div>
            {danger.location_name && (
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-1">
                    <MapPin className="w-3 h-3" />
                    {danger.location_name}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Yellow Beacon — Suspicious Activity Details Panel
// ============================================================================

function SuspiciousDetailsPanel({ log }: { log: SuspiciousLog }) {
    const statusStyles: Record<string, { color: string; label: string }> = {
        pending: { color: '#ffcc00', label: 'Pending Review' },
        investigating: { color: '#00aaff', label: 'Investigating' },
        resolved: { color: '#22c55e', label: 'Resolved' },
        false_alarm: { color: '#6b7280', label: 'False Alarm' },
    };
    const st = statusStyles[log.status] || statusStyles.pending;

    return (
        <div className="mx-4 mt-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
                <Eye className="w-3.5 h-3.5 text-[#ffcc00]" />
                <span className="text-[10px] font-mono text-[#ffcc00] uppercase tracking-widest">Activity Details</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <InfoCard label="Status" icon={<Shield className="w-3.5 h-3.5" />} accent="#ffcc00">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: st.color }} />
                        <span className="text-sm font-semibold" style={{ color: st.color }}>{st.label}</span>
                    </div>
                </InfoCard>
                <InfoCard label="Person Hash" icon={<Hash className="w-3.5 h-3.5" />} accent="#ffcc00">
                    <span className="text-sm font-mono text-gray-300">
                        {log.person_id_hash ? log.person_id_hash.slice(0, 10) + '…' : 'N/A'}
                    </span>
                </InfoCard>
                <InfoCard label="Camera ID" icon={<Camera className="w-3.5 h-3.5" />} accent="#ffcc00">
                    <span className="text-sm font-mono text-gray-300">{log.location_id || 'N/A'}</span>
                </InfoCard>
            </div>
            {log.location_name && (
                <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-1">
                    <MapPin className="w-3 h-3" />
                    {log.location_name}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Purple Beacon — User Report Panel (completely different from CCTV beacons)
// ============================================================================

function ReportPanel({ report }: { report: UserReportedCrime }) {
    const isProcessing = report.validation_status === 'processing';
    const isPending = report.validation_status === 'pending';
    const hasAIResults = !!report.classified_crime_type || !!report.gemini_analysis;

    const severityFromJustification = (() => {
        const j = report.gemini_justification?.toLowerCase() || '';
        if (j.includes('severity: critical')) return 'critical';
        if (j.includes('severity: high')) return 'high';
        if (j.includes('severity: medium')) return 'medium';
        if (j.includes('severity: low')) return 'low';
        return null;
    })();

    const severityStyles: Record<string, { color: string; bg: string; border: string }> = {
        critical: { color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' },
        high: { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
        medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30' },
        low: { color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30' },
    };

    return (
        <div className="px-4 pt-3 pb-1 space-y-3">
            {/* Report info */}
            <div className="flex items-center gap-2 mb-1">
                <FileText className="w-3.5 h-3.5 text-[#a855f7]" />
                <span className="text-[10px] font-mono text-[#a855f7] uppercase tracking-widest">Report Details</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <InfoCard label="Crime Type" icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="#a855f7">
                    <span className="text-sm font-bold text-white uppercase">{report.crime_type.replace('_', ' ')}</span>
                </InfoCard>
                <InfoCard label="Validation" icon={<CheckCircle className="w-3.5 h-3.5" />} accent="#a855f7">
                    <StatusBadge status={report.validation_status} />
                </InfoCard>
            </div>
            {report.description && (
                <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-1">Description</div>
                    <p className="text-sm text-gray-300 leading-relaxed">{report.description}</p>
                </div>
            )}

            {/* AI Processing Indicator */}
            {(isProcessing || isPending) && !hasAIResults && (
                <div className="rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 p-4">
                    <div className="flex items-center gap-3">
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 text-[#a855f7] animate-spin" />
                        ) : (
                            <Clock className="w-5 h-5 text-[#a855f7] animate-pulse" />
                        )}
                        <div>
                            <div className="text-sm font-semibold text-[#a855f7]">
                                {isProcessing ? 'AI Analysis In Progress' : 'Awaiting AI Analysis'}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                {isProcessing
                                    ? 'VideoMAE classification and Gemini analysis are processing the evidence video…'
                                    : 'This report is queued for automated video classification and AI analysis.'}
                            </div>
                        </div>
                    </div>
                    {isProcessing && (
                        <div className="mt-3 space-y-2">
                            <PipelineStep label="Video Download" status="complete" />
                            <PipelineStep label="VideoMAE Crime Classification" status="active" />
                            <PipelineStep label="Gemini Multimodal Analysis" status="pending" />
                            <PipelineStep label="Validation Decision" status="pending" />
                        </div>
                    )}
                </div>
            )}

            {/* AI Analysis Section — shown when results exist */}
            {hasAIResults && (
                <>
                    <div className="flex items-center gap-2 pt-1">
                        <Brain className="w-3.5 h-3.5 text-[#a855f7]" />
                        <span className="text-[10px] font-mono text-[#a855f7] uppercase tracking-widest">AI Analysis</span>
                        {severityFromJustification && (
                            <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${severityStyles[severityFromJustification]?.bg} ${severityStyles[severityFromJustification]?.border} ${severityStyles[severityFromJustification]?.color}`}>
                                <ShieldAlert className="w-3 h-3" />
                                {severityFromJustification}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {/* VideoMAE Classification Card */}
                        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <TrendingUp className="w-3 h-3 text-[#a855f7]/60" />
                                <div className="text-[10px] font-mono text-gray-500 uppercase">VideoMAE Classification</div>
                            </div>
                            <div className="text-sm font-bold capitalize text-white mb-2">
                                {report.classified_crime_type?.replace('_', ' ').replace('Normal Videos', 'Normal / No Crime') || 'Pending…'}
                            </div>
                            {report.classification_confidence != null && (
                                <>
                                    <div className="flex justify-between text-[10px] mb-1">
                                        <span className="text-gray-500">Confidence</span>
                                        <span className={`font-bold ${report.classification_confidence > 0.8
                                            ? 'text-green-400' : report.classification_confidence > 0.5
                                                ? 'text-yellow-400' : 'text-red-400'
                                            }`}>
                                            {(report.classification_confidence * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${report.classification_confidence * 100}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className="h-full rounded-full"
                                            style={{
                                                backgroundColor: report.classification_confidence > 0.8
                                                    ? '#22c55e' : report.classification_confidence > 0.5
                                                        ? '#eab308' : '#ef4444',
                                            }}
                                        />
                                    </div>
                                    {/* Model match indicator */}
                                    {report.classified_crime_type && (
                                        <div className="mt-2 flex items-center gap-1.5">
                                            {report.classified_crime_type.toLowerCase().replace(/\s+/g, '_') ===
                                                report.crime_type.replace('_', '_') ? (
                                                <div className="flex items-center gap-1 text-[10px] text-green-400">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span>Matches reported type</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-[10px] text-yellow-400">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span>Differs from reported type</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Gemini Analysis Card */}
                        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Brain className="w-3 h-3 text-[#a855f7]/60" />
                                <div className="text-[10px] font-mono text-gray-500 uppercase">Gemini AI Analysis</div>
                            </div>
                            {report.gemini_analysis ? (
                                <p className="text-xs text-gray-300 leading-relaxed">{report.gemini_analysis}</p>
                            ) : (
                                <p className="text-xs text-gray-600 italic">Awaiting analysis…</p>
                            )}
                        </div>
                    </div>

                    {/* Gemini Justification — full width */}
                    {report.gemini_justification && (
                        <div className="rounded-lg bg-white/[0.02] border-l-2 border-[#a855f7]/30 p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Shield className="w-3 h-3 text-[#a855f7]/60" />
                                <div className="text-[10px] font-mono text-gray-500 uppercase">AI Justification</div>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">{report.gemini_justification}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** Pipeline step indicator shown during processing state */
function PipelineStep({ label, status }: { label: string; status: 'complete' | 'active' | 'pending' }) {
    return (
        <div className="flex items-center gap-2.5">
            {status === 'complete' && (
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            )}
            {status === 'active' && (
                <Loader2 className="w-3.5 h-3.5 text-[#a855f7] animate-spin flex-shrink-0" />
            )}
            {status === 'pending' && (
                <div className="w-3.5 h-3.5 rounded-full border border-gray-600 flex-shrink-0" />
            )}
            <span className={`text-xs font-mono ${status === 'complete' ? 'text-green-400' : status === 'active' ? 'text-[#a855f7]' : 'text-gray-600'}`}>
                {label}
            </span>
        </div>
    );
}

// ============================================================================
// Main Evidence Modal
// ============================================================================

export default function EvidenceModal() {
    const {
        selectedAlert, selectedAlertType, isModalOpen, isCCTVStreamOpen,
        closeModal, openCCTVStream, closeCCTVStream, fetchUserReportedCrimes,
    } = useAlertStore();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isRevalidating, setIsRevalidating] = useState(false);

    // Keyboard escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isCCTVStreamOpen) closeCCTVStream();
                else closeModal();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [closeModal, closeCCTVStream, isCCTVStreamOpen]);

    // Pause video when modal closes
    useEffect(() => {
        if (!isModalOpen && videoRef.current) videoRef.current.pause();
    }, [isModalOpen]);

    if (!selectedAlert || !selectedAlertType) return null;

    const style = BEACON_STYLES[selectedAlertType];
    const isCCTV = selectedAlertType === 'blue';
    const isDanger = selectedAlertType === 'red';
    const isSuspicious = selectedAlertType === 'yellow';
    const isReport = selectedAlertType === 'purple';

    // ---------- helpers ----------

    /** Find the nearest (or same) CCTV camera for red/yellow beacons */
    const getNearestCCTV = (): CCTVCamera | null => {
        const { cctvCameras } = useAlertStore.getState();
        if (isCCTV) return selectedAlert as CCTVCamera;
        if (cctvCameras.length === 0) return null;
        if (!selectedAlert.lat || !selectedAlert.long) return cctvCameras[0];
        let nearest: CCTVCamera | null = null;
        let minDist = Infinity;
        for (const cam of cctvCameras) {
            const d = Math.hypot(cam.lat - selectedAlert.lat!, cam.long - selectedAlert.long!);
            if (d < minDist) { minDist = d; nearest = cam; }
        }
        return nearest;
    };

    const nearestCamera = getNearestCCTV();

    /** Subtitle for header */
    const subtitle = isDanger
        ? (selectedAlert as ImmediateDanger).activity_type.toUpperCase()
        : isSuspicious
            ? 'Pending Review'
            : isCCTV
                ? (selectedAlert as CCTVCamera).camera_name
                : (selectedAlert as UserReportedCrime).crime_type.replace('_', ' ').toUpperCase();

    /** Evidence video URL (red, yellow, purple – NOT blue) */
    const evidenceUrl = (() => {
        if (isCCTV) return null;
        const alert = selectedAlert as ImmediateDanger | SuspiciousLog | UserReportedCrime;
        return alert.evidence_video_url || null;
    })();

    /** Timestamp */
    const timestamp = (() => {
        if ('detected_at' in selectedAlert) return (selectedAlert as any).detected_at;
        if ('reported_at' in selectedAlert) return (selectedAlert as UserReportedCrime).reported_at;
        if ('last_heartbeat' in selectedAlert) return (selectedAlert as CCTVCamera).last_heartbeat;
        return null;
    })();

    const timestampLabel = isCCTV ? 'Last Heartbeat' : isReport ? 'Reported At' : 'Detected At';

    // =======================================================================

    return (
        <>
            {/* ---- CCTV Stream Overlay ---- */}
            <AnimatePresence>
                {isCCTVStreamOpen && (
                    <CCTVStreamView
                        camera={nearestCamera}
                        sourceLabel={
                            isCCTV ? undefined
                                : isDanger ? `Near: ${(selectedAlert as ImmediateDanger).activity_type}`
                                : isSuspicious ? 'Near: Suspicious Activity'
                                : `Near: ${(selectedAlert as UserReportedCrime).crime_type}`
                        }
                        onClose={closeCCTVStream}
                    />
                )}
            </AnimatePresence>

            {/* ---- Main Modal ---- */}
            <AnimatePresence>
                {isModalOpen && !isCCTVStreamOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                            onClick={closeModal}
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 24 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                        >
                            <div
                                className={`pointer-events-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-secondary)] border ${style.border} ${style.shadow}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* ———— Header ———— */}
                                <div className={`px-5 py-4 flex items-center justify-between ${style.headerBg} ${style.headerBorder}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${style.iconBg} ${style.iconColor}`}>
                                            {getBeaconIcon(selectedAlertType)}
                                        </div>
                                        <div>
                                            <h2 className={`text-lg font-bold uppercase tracking-wider ${style.titleColor}`}>
                                                {style.title}
                                            </h2>
                                            <p className="text-sm text-[var(--text-secondary)] capitalize">{subtitle}</p>
                                        </div>
                                    </div>
                                    <button onClick={closeModal} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                {/* ———— Body: Blue (CCTV) ———— */}
                                {isCCTV && (
                                    <CCTVInfoPanel
                                        camera={selectedAlert as CCTVCamera}
                                        onOpenStream={openCCTVStream}
                                    />
                                )}

                                {/* ———— Body: Red (Immediate Danger from CCTV) ———— */}
                                {isDanger && (
                                    <>
                                        <SourceCameraBar camera={nearestCamera} accentRgb={style.accentRgb} />
                                        <EvidenceVideoPlayer url={evidenceUrl} accent={style.accent} videoRef={videoRef} />
                                        <ThreatDetailsPanel danger={selectedAlert as ImmediateDanger} />
                                    </>
                                )}

                                {/* ———— Body: Yellow (Suspicious from CCTV) ———— */}
                                {isSuspicious && (
                                    <>
                                        <SourceCameraBar camera={nearestCamera} accentRgb={style.accentRgb} />
                                        <EvidenceVideoPlayer url={evidenceUrl} accent={style.accent} videoRef={videoRef} />
                                        <SuspiciousDetailsPanel log={selectedAlert as SuspiciousLog} />
                                    </>
                                )}

                                {/* ———— Body: Purple (User Report — NOT CCTV) ———— */}
                                {isReport && (
                                    <>
                                        <EvidenceVideoPlayer url={evidenceUrl} accent={style.accent} videoRef={videoRef} />
                                        <ReportPanel report={selectedAlert as UserReportedCrime} />
                                    </>
                                )}

                                {/* ———— Footer: Metadata Row ———— */}
                                <div className="mx-4 mt-4 mb-1 grid grid-cols-3 gap-3">
                                    <DetailItem
                                        icon={<Clock className="w-4 h-4" />}
                                        label={timestampLabel}
                                        value={timestamp ? new Date(timestamp).toLocaleString() : 'N/A'}
                                    />
                                    <DetailItem
                                        icon={<MapPin className="w-4 h-4" />}
                                        label="Coordinates"
                                        value={
                                            selectedAlert.lat != null && selectedAlert.long != null
                                                ? `${selectedAlert.lat.toFixed(4)}, ${selectedAlert.long.toFixed(4)}`
                                                : 'Unknown'
                                        }
                                    />
                                    <DetailItem
                                        icon={isCCTV ? <Camera className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        label={isCCTV ? 'Camera ID' : 'Evidence ID'}
                                        value={selectedAlert.id.slice(0, 8)}
                                    />
                                </div>

                                {/* ———— Actions ———— */}
                                <div className="p-4 flex gap-3 border-t border-[var(--border-primary)] mt-3">
                                    {isCCTV ? (
                                        /* Blue: single CTA to open live feed */
                                        <button
                                            onClick={openCCTVStream}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-sm transition-colors bg-[#00aaff]/15 border border-[#00aaff]/40 text-[#00aaff] hover:bg-[#00aaff]/25"
                                        >
                                            <Video className="w-4 h-4" />
                                            Real-time CCTV
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    ) : isReport ? (
                                        /* Purple: review actions (no CCTV button – not a camera) */
                                        <>
                                            <button
                                                onClick={async () => {
                                                    const r = selectedAlert as UserReportedCrime;
                                                    setIsRevalidating(true);
                                                    try {
                                                        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
                                                        await fetch(`${backendUrl}/reports/crime/${r.id}/revalidate`, { method: 'POST' });
                                                        // Refresh reports after a brief delay for the status update
                                                        setTimeout(() => fetchUserReportedCrimes(), 1500);
                                                    } catch (e) {
                                                        console.error('Re-validate failed:', e);
                                                    } finally {
                                                        setIsRevalidating(false);
                                                    }
                                                }}
                                                disabled={isRevalidating}
                                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-sm bg-[#a855f7]/15 border border-[#a855f7]/40 text-[#a855f7] hover:bg-[#a855f7]/25 transition-colors disabled:opacity-50"
                                            >
                                                {isRevalidating ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                )}
                                                {isRevalidating ? 'Re-validating…' : 'Re-validate AI'}
                                            </button>
                                            <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-sm bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors">
                                                <CheckCircle className="w-4 h-4" />
                                                Approve Report
                                            </button>
                                            <button className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-mono text-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                                                Reject
                                            </button>
                                        </>
                                    ) : (
                                        /* Red / Yellow: review + CCTV + dispatch */
                                        <>
                                            <button
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-sm transition-colors"
                                                style={{
                                                    background: `rgba(${style.accentRgb},0.12)`,
                                                    borderWidth: 1,
                                                    borderColor: `rgba(${style.accentRgb},0.35)`,
                                                    color: style.accent,
                                                }}
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Mark as Reviewed
                                            </button>
                                            <button
                                                onClick={openCCTVStream}
                                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00aaff]/10 border border-[#00aaff]/30 text-[#00aaff] hover:bg-[#00aaff]/20 transition-colors text-sm font-mono"
                                            >
                                                <Video className="w-4 h-4" />
                                                Real-time CCTV
                                            </button>
                                            <button className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-mono text-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                                                Dispatch Unit
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

// ============================================================================
// Shared Sub-Components
// ============================================================================

/** Small info card used across panels */
function InfoCard({ label, icon, accent, children }: {
    label: string;
    icon: React.ReactNode;
    accent: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
                <span style={{ color: `${accent}99` }}>{icon}</span>
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wide">{label}</span>
            </div>
            {children}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        pending: { bg: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-400', icon: <Clock className="w-3 h-3" /> },
        processing: { bg: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-400', icon: <Brain className="w-3 h-3" /> },
        validated: { bg: 'bg-green-500/20 border-green-500/40', text: 'text-green-400', icon: <CheckCircle className="w-3 h-3" /> },
        rejected: { bg: 'bg-red-500/20 border-red-500/40', text: 'text-red-400', icon: <X className="w-3 h-3" /> },
        reviewed: { bg: 'bg-cyan-500/20 border-cyan-500/40', text: 'text-cyan-400', icon: <Shield className="w-3 h-3" /> },
    };
    const s = styles[status] || styles.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-mono uppercase ${s.bg} ${s.text}`}>
            {s.icon}
            {status}
        </span>
    );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3">
            <div className="p-1.5 rounded-md bg-white/[0.04] text-[var(--neon-cyan)]">
                {icon}
            </div>
            <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5 font-mono">{label}</div>
                <div className="text-sm font-medium">{value}</div>
            </div>
        </div>
    );
}
