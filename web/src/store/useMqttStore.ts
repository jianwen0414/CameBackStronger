/**
 * NightWalk Web - MQTT Store (Zustand)
 * Manages a single MQTT WebSocket connection to the Mosquitto broker.
 * Subscribes to the `+/analytics` wildcard topic to receive real-time
 * per-camera analytics (person count, alert count, active threats).
 *
 * Topic pattern:  cam-XX/analytics
 * Broker WS port: 9001  (configured via VITE_MQTT_WS_URL)
 */
import { create } from 'zustand';
import mqtt, { type MqttClient } from 'mqtt';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CameraAnalytics {
    camera_id: number | string;
    topic_prefix: string;    // e.g. "cam-01"
    person_count: number;
    alert_count: number;
    active_threats: number;
    timestamp: string;
    last_updated: number;    // Date.now() when received
}

interface MqttState {
    client: MqttClient | null;
    connected: boolean;
    /** Analytics keyed by topic_prefix, e.g. { "cam-01": {...} } */
    analytics: Record<string, CameraAnalytics>;

    connect: () => void;
    disconnect: () => void;
    /** Returns analytics for the given topic_prefix, or the most recently
     *  updated entry if no match found (fallback for single-camera setups). */
    getAnalyticsForCamera: (cameraName: string) => CameraAnalytics | null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MQTT_WS_URL = import.meta.env.VITE_MQTT_WS_URL || 'ws://localhost:9001';

export const useMqttStore = create<MqttState>((set, get) => ({
    client: null,
    connected: false,
    analytics: {},

    connect: () => {
        const existing = get().client;
        if (existing) return; // already connected

        const client = mqtt.connect(MQTT_WS_URL, {
            clientId: `nightwalk-web-${Math.random().toString(16).slice(2, 8)}`,
            clean: true,
            reconnectPeriod: 3000,
        });

        client.on('connect', () => {
            console.log('[MQTT] Connected to', MQTT_WS_URL);
            set({ connected: true });
            // Subscribe to all cameras' analytics topics
            client.subscribe('+/analytics', { qos: 0 }, (err) => {
                if (err) console.error('[MQTT] Subscribe error:', err);
                else console.log('[MQTT] Subscribed to +/analytics');
            });
        });

        client.on('message', (_topic: string, payload: Buffer) => {
            try {
                const data = JSON.parse(payload.toString()) as Omit<CameraAnalytics, 'last_updated'>;
                if (!data.topic_prefix) return;
                set((state) => ({
                    analytics: {
                        ...state.analytics,
                        [data.topic_prefix]: {
                            ...data,
                            last_updated: Date.now(),
                        },
                    },
                }));
            } catch {
                // ignore malformed payloads
            }
        });

        client.on('disconnect', () => set({ connected: false }));
        client.on('error', (err) => console.error('[MQTT] Error:', err));

        set({ client });
    },

    disconnect: () => {
        const { client } = get();
        if (client) {
            client.end();
            set({ client: null, connected: false });
        }
    },

    getAnalyticsForCamera: (cameraName: string) => {
        const { analytics } = get();
        const entries = Object.values(analytics);
        if (entries.length === 0) return null;

        // Try to match camera name to a topic prefix (case-insensitive substring)
        const name = cameraName.toLowerCase();
        const match = entries.find(
            (a) => name.includes(a.topic_prefix.toLowerCase()) ||
                   a.topic_prefix.toLowerCase().includes(name.replace(/\s+/g, '-'))
        );
        if (match) return match;

        // Fallback: return most recently updated entry
        return entries.reduce((latest, cur) =>
            cur.last_updated > latest.last_updated ? cur : latest
        );
    },
}));
