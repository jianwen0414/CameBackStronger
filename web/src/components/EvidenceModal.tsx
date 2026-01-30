/**
 * NightWalk Web - Evidence Modal
 * Displays video evidence for selected alerts with Aceternity-style glassmorphism
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Clock, MapPin, Play } from 'lucide-react';
import { useAlertStore } from '../store/useAlertStore';

export default function EvidenceModal() {
    const { selectedAlert, isModalOpen, closeModal } = useAlertStore();
    const videoRef = useRef<HTMLVideoElement>(null);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [closeModal]);

    // Pause video when modal closes
    useEffect(() => {
        if (!isModalOpen && videoRef.current) {
            videoRef.current.pause();
        }
    }, [isModalOpen]);

    if (!selectedAlert) return null;

    const isImmediate = 'activity_type' in selectedAlert;
    const alertType = isImmediate
        ? (selectedAlert as any).activity_type
        : 'suspicious';
    const evidenceUrl = selectedAlert.evidence_video_url;

    // Convert GCS URL to public URL if needed
    const videoUrl = evidenceUrl.startsWith('gs://')
        ? evidenceUrl.replace('gs://', 'https://storage.googleapis.com/')
        : evidenceUrl;

    return (
        <AnimatePresence>
            {isModalOpen && (
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
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div
                            className={`
                pointer-events-auto w-full max-w-4xl rounded-2xl overflow-hidden
                bg-[var(--bg-secondary)] border
                ${isImmediate
                                    ? 'border-[var(--neon-red)] shadow-[0_0_60px_rgba(255,0,64,0.3)]'
                                    : 'border-[var(--neon-yellow)] shadow-[0_0_60px_rgba(255,204,0,0.2)]'
                                }
              `}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className={`
                p-4 flex items-center justify-between
                ${isImmediate
                                    ? 'bg-gradient-to-r from-[rgba(255,0,64,0.2)] to-transparent border-b border-[var(--neon-red)]'
                                    : 'bg-gradient-to-r from-[rgba(255,204,0,0.1)] to-transparent border-b border-[var(--neon-yellow)]'
                                }
              `}>
                                <div className="flex items-center gap-3">
                                    <div className={`
                    p-2 rounded-lg
                    ${isImmediate ? 'bg-[rgba(255,0,64,0.2)]' : 'bg-[rgba(255,204,0,0.2)]'}
                  `}>
                                        <AlertTriangle className={`w-5 h-5 ${isImmediate ? 'text-[#ff0040]' : 'text-[#ffcc00]'}`} />
                                    </div>
                                    <div>
                                        <h2 className={`text-lg font-bold uppercase tracking-wider ${isImmediate ? 'text-glow-red' : 'text-[#ffcc00]'}`}>
                                            {isImmediate ? 'Immediate Danger' : 'Suspicious Activity'}
                                        </h2>
                                        <p className="text-sm text-[var(--text-secondary)] capitalize">
                                            Type: {alertType}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={closeModal}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Video Player */}
                            <div className="relative aspect-video bg-black">
                                <video
                                    ref={videoRef}
                                    src={videoUrl}
                                    controls
                                    className="w-full h-full object-contain"
                                    poster="/video-placeholder.jpg"
                                >
                                    Your browser does not support the video tag.
                                </video>

                                {/* Scanline overlay effect */}
                                <div className="absolute inset-0 pointer-events-none scanlines opacity-20" />

                                {/* Corner decorations */}
                                <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-[var(--neon-cyan)] opacity-50" />
                                <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-[var(--neon-cyan)] opacity-50" />
                                <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-[var(--neon-cyan)] opacity-50" />
                                <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-[var(--neon-cyan)] opacity-50" />
                            </div>

                            {/* Details Footer */}
                            <div className="p-4 grid grid-cols-3 gap-4 bg-[var(--bg-tertiary)]">
                                <DetailItem
                                    icon={<Clock className="w-4 h-4" />}
                                    label="Detected At"
                                    value={new Date(selectedAlert.detected_at).toLocaleString()}
                                />
                                <DetailItem
                                    icon={<MapPin className="w-4 h-4" />}
                                    label="Coordinates"
                                    value={selectedAlert.lat && selectedAlert.long
                                        ? `${selectedAlert.lat.toFixed(4)}, ${selectedAlert.long.toFixed(4)}`
                                        : 'Unknown'
                                    }
                                />
                                <DetailItem
                                    icon={<Play className="w-4 h-4" />}
                                    label="Evidence ID"
                                    value={selectedAlert.id.slice(0, 8)}
                                />
                            </div>

                            {/* Actions */}
                            <div className="p-4 flex gap-3 border-t border-[var(--border-primary)]">
                                <button className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    <Play className="w-4 h-4" />
                                    Mark as Reviewed
                                </button>
                                <button className="btn-danger flex items-center justify-center gap-2 px-6">
                                    Dispatch Unit
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// Detail Item Component
interface DetailItemProps {
    icon: React.ReactNode;
    label: string;
    value: string;
}

function DetailItem({ icon, label, value }: DetailItemProps) {
    return (
        <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--bg-glass)] text-[var(--neon-cyan)]">
                {icon}
            </div>
            <div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">
                    {label}
                </div>
                <div className="text-sm font-medium">
                    {value}
                </div>
            </div>
        </div>
    );
}
