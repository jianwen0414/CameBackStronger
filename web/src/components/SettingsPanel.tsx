/**
 * NightWalk Web - Settings Panel
 * Camera management: list all CCTV cameras and register new ones
 */
import { useEffect, useState, useCallback } from 'react';
import { Camera, Plus, MapPin, Radio, Loader2, RefreshCw, X, Video } from 'lucide-react';
import { Input } from './ui/Input';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface CCTVCamera {
  id: string;
  camera_name: string;
  location_name: string | null;
  lat: number;
  long: number;
  altitude: number | null;
  stream_url: string | null;
  is_active: boolean;
  last_heartbeat: string | null;
}

export default function SettingsPanel() {
  const [cameras, setCameras] = useState<CCTVCamera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchCameras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/cctv/cameras`);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const data = await res.json();
      setCameras(data.cameras || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cameras');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">CCTV Cameras</h2>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-widest mt-1">
              Manage registered devices
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCameras}
              className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/90 hover:bg-sky-400 text-white text-sm font-semibold transition-colors shadow-lg shadow-sky-500/20 border border-sky-400/30"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancel' : 'Add Camera'}
            </button>
          </div>
        </div>

        {/* Add Camera Form */}
        {showForm && (
          <AddCameraForm
            onSuccess={() => { setShowForm(false); fetchCameras(); }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Camera List */}
        {isLoading && cameras.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-20">
            <Camera className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No cameras registered yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sky-400 text-sm hover:underline"
            >
              Register your first camera
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {cameras.map(cam => (
              <div
                key={cam.id}
                className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[rgba(20,20,25,0.6)] backdrop-blur-md border border-white/10 hover:border-sky-500/20 transition-colors"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20 flex-shrink-0">
                  <Video className="w-4 h-4 text-sky-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{cam.camera_name}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                      cam.is_active
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                    }`}>
                      <Radio className="w-2.5 h-2.5" />
                      {cam.is_active ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {cam.location_name && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {cam.location_name}
                      </span>
                    )}
                    <span className="font-mono">
                      {cam.lat.toFixed(4)}, {cam.long.toFixed(4)}
                      {cam.altitude != null && ` · ${cam.altitude}m`}
                    </span>
                  </div>
                </div>

                {/* Stream indicator */}
                {cam.stream_url && (
                  <div className="text-[10px] text-gray-600 font-mono truncate max-w-[140px]" title={cam.stream_url}>
                    {cam.stream_url}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Count */}
        {cameras.length > 0 && (
          <p className="text-xs text-gray-600 font-mono text-center">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''} registered
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Add Camera Form (inline)
// ============================================================================

/** Extract lat/long from common Google Maps URL formats */
function parseGoogleMapsUrl(url: string): { lat: number; long: number } | null {
  // !3dlat...!4dlong (place URLs: most accurate coordinates)
  const placeMatch = url.match(/3d(-?[0-9.]+).*4d(-?[0-9.]+)/);
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), long: parseFloat(placeMatch[2]) };

  // @lat,lng,zoom  (viewport center: /maps/@4.648,101.111,17z)
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), long: parseFloat(atMatch[2]) };

  // ?q=lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), long: parseFloat(qMatch[2]) };

  // ll=lat,lng
  const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) return { lat: parseFloat(llMatch[1]), long: parseFloat(llMatch[2]) };

  return null;
}

function AddCameraForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingAlt, setIsFetchingAlt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapsUrl, setMapsUrl] = useState('');
  const [mapsUrlError, setMapsUrlError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    camera_name: '',
    location_name: '',
    lat: '',
    long: '',
    altitude: '',
    stream_url: '',
    zone_id: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleMapsUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setMapsUrl(url);
    setMapsUrlError(null);
    if (!url.trim()) return;
    const coords = parseGoogleMapsUrl(url);
    if (coords) {
      setFormData(prev => ({
        ...prev,
        lat: coords.lat.toString(),
        long: coords.long.toString(),
      }));
      setMapsUrlError(null);
    } else {
      setMapsUrlError('Could not extract coordinates — paste the full Google Maps URL');
    }
  };

  const fetchAltitude = async () => {
    const lat = parseFloat(formData.lat);
    const long = parseFloat(formData.long);
    if (isNaN(lat) || isNaN(long)) {
      setError('Enter valid lat/long first');
      return;
    }
    setIsFetchingAlt(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/cctv/elevation?lat=${lat}&long=${long}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setFormData(prev => ({ ...prev, altitude: Math.round(data.elevation).toString() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch elevation');
    } finally {
      setIsFetchingAlt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.camera_name.trim()) {
      setError('Camera name is required');
      return;
    }

    const lat = parseFloat(formData.lat);
    const long = parseFloat(formData.long);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90');
      return;
    }
    if (isNaN(long) || long < -180 || long > 180) {
      setError('Longitude must be between -180 and 180');
      return;
    }

    const payload: Record<string, unknown> = {
      camera_name: formData.camera_name.trim(),
      lat,
      long,
    };
    const altitude = parseFloat(formData.altitude);
    if (!isNaN(altitude)) payload.altitude = altitude;
    if (formData.location_name.trim()) payload.location_name = formData.location_name.trim();
    if (formData.stream_url.trim()) payload.stream_url = formData.stream_url.trim();
    if (formData.zone_id.trim()) payload.zone_id = formData.zone_id.trim();

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/cctv/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register camera');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasCoords = formData.lat && formData.long &&
    !isNaN(parseFloat(formData.lat)) && !isNaN(parseFloat(formData.long));

  return (
    <form
      onSubmit={handleSubmit}
      className="p-5 rounded-xl bg-[rgba(15,15,20,0.8)] backdrop-blur-xl border border-sky-500/20 space-y-4"
    >
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
          <Camera className="w-4 h-4 text-sky-400" />
        </div>
        <h3 className="text-sm font-bold text-white">Register New Camera</h3>
      </div>

      {/* Google Maps URL shortcut */}
      <div className="space-y-1">
        <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">
          Google Maps URL <span className="text-gray-600 normal-case">(optional shortcut)</span>
        </label>
        <input
          type="text"
          placeholder="Paste a Google Maps link to auto-fill coordinates…"
          value={mapsUrl}
          onChange={handleMapsUrl}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-all text-sm"
        />
        {mapsUrlError && (
          <p className="text-[11px] text-red-400 font-mono">{mapsUrlError}</p>
        )}
        {!mapsUrlError && formData.lat && formData.long && mapsUrl && (
          <p className="text-[11px] text-green-400 font-mono">
            ✓ Coordinates extracted: {formData.lat}, {formData.long}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Camera Name *"
          name="camera_name"
          placeholder="e.g. CAM-01"
          value={formData.camera_name}
          onChange={handleChange}
          required
        />
        <Input
          label="Location Name"
          name="location_name"
          placeholder="e.g. Jalan Sultan Iskandar"
          value={formData.location_name}
          onChange={handleChange}
        />
      </div>

      {/* Coordinates + Altitude row */}
      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Latitude *"
          name="lat"
          type="number"
          step="any"
          placeholder="4.6480"
          value={formData.lat}
          onChange={handleChange}
          required
        />
        <Input
          label="Longitude *"
          name="long"
          type="number"
          step="any"
          placeholder="101.1112"
          value={formData.long}
          onChange={handleChange}
          required
        />
        {/* Altitude with auto-fetch */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">
            Altitude (m)
          </label>
          <div className="flex gap-1.5">
            <input
              name="altitude"
              type="number"
              step="any"
              placeholder="50"
              value={formData.altitude}
              onChange={handleChange}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-all text-sm"
            />
            <button
              type="button"
              onClick={fetchAltitude}
              disabled={!hasCoords || isFetchingAlt}
              title="Fetch terrain elevation from Google"
              className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isFetchingAlt
                ? <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                : <MapPin className="w-4 h-4 text-sky-400" />
              }
            </button>
          </div>
          {!hasCoords && (
            <p className="text-[10px] text-gray-600 font-mono">Enter coords first</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Stream URL"
          name="stream_url"
          placeholder="rtsp://... or http://..."
          value={formData.stream_url}
          onChange={handleChange}
        />
        <Input
          label="Zone ID"
          name="zone_id"
          placeholder="e.g. zone-north"
          value={formData.zone_id}
          onChange={handleChange}
        />
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-sky-500/20"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Registering…
            </>
          ) : (
            'Register Camera'
          )}
        </button>
      </div>
    </form>
  );
}
