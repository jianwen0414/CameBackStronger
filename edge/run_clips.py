#!/usr/bin/env python3
"""
Run weapon detection on two video clips simulating two CCTV cameras.
Uses shared PersonReID so the same person gets the same global ID (GID)
across cameras. Alerts are POSTed to the backend.

Camera coordinates are fetched from the backend (GET /cctv/cameras),
matching by camera name (cam-001, cam-002).

Usage:
    cd edge
    uv run python run_clips.py
"""
import cv2
import os
import subprocess
import time
import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
MEDIAMTX_URL = os.getenv("MEDIAMTX_URL", "rtsp://localhost:8554")
MEDIAMTX_HLS  = os.getenv("MEDIAMTX_HLS", "http://localhost:8889")

# All cameras — CAM-001 can also run via main.py for live MJPEG.
CLIP_MAP = [
    {"name": "CAM-001", "file": "clips/clip2.mp4", "rtsp_path": "cam001"},
    {"name": "CAM-002", "file": "clips/clip3.mp4", "rtsp_path": "cam002"},
    {"name": "CAM-003", "file": "clips/clip4.mp4", "rtsp_path": "cam003"},
    {"name": "CAM-004", "file": "clips/clip5.mp4", "rtsp_path": "cam004"},
]

FRAME_SKIP = 2
IMGSZ = 416
USE_REID = True
REID_DEVICE = "cpu"

_ffmpeg_procs: list[subprocess.Popen] = []


def start_rtsp_stream(clip_path: str, rtsp_path: str) -> subprocess.Popen | None:
    """Loop clip_path → MediaMTX RTSP path. Returns the ffmpeg Popen or None."""
    abs_clip = os.path.join(os.path.dirname(os.path.abspath(__file__)), clip_path)
    if not os.path.exists(abs_clip):
        print(f"⚠️  Clip not found for streaming: {abs_clip}")
        return None
    rtsp_url = f"{MEDIAMTX_URL}/{rtsp_path}"
    cmd = [
        "ffmpeg", "-loglevel", "error",
        "-re", "-stream_loop", "-1", "-i", abs_clip,
        "-c", "copy",           # pass-through: no re-encode, preserves original quality
        "-f", "rtsp", "-rtsp_transport", "tcp", rtsp_url,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  📡 Streaming {os.path.basename(clip_path)} → {rtsp_url}")
    return proc


def patch_stream_url(camera_name: str, rtsp_path: str) -> None:
    """Tell the backend the HLS URL for this camera."""
    hls_url = f"{MEDIAMTX_HLS}/{rtsp_path}/"
    try:
        resp = requests.patch(
            f"{BACKEND_URL}/cctv/cameras/{camera_name}",
            json={"stream_url": hls_url},
            timeout=5,
        )
        if resp.ok:
            print(f"  ✅ stream_url set → {hls_url}")
        else:
            print(f"  ⚠️  PATCH {camera_name} → {resp.status_code}: {resp.text[:120]}")
    except Exception as e:
        print(f"  ⚠️  Could not update stream_url: {e}")


def fetch_camera_coords() -> dict[str, tuple[float, float]]:
    """Fetch camera coordinates from the backend."""
    try:
        resp = requests.get(f"{BACKEND_URL}/cctv/cameras", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        cameras = data.get("cameras", data) if isinstance(data, dict) else data
        coords = {}
        for cam in cameras:
            name = cam.get("camera_name", "")
            lat = cam.get("lat")
            lng = cam.get("long")
            if name and lat is not None and lng is not None:
                coords[name] = (lat, lng)
        return coords
    except Exception as e:
        print(f"⚠️  Could not fetch cameras from backend: {e}")
        return {}


def process_clip(cfg: dict, coords: dict, reid_model):
    """Process a single clip with a fresh Detector instance."""
    import detector as det_module
    from detector import Detector

    cam_name = cfg["name"]
    cam_id = int(cam_name.split("-")[1])
    clip_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), cfg["file"])

    if not os.path.exists(clip_path):
        print(f"❌ Clip not found: {clip_path}")
        return

    # Look up coordinates from DB
    if cam_name not in coords:
        print(f"⚠️  Camera '{cam_name}' not found in backend. "
              f"Register it first via Settings. Skipping.")
        return

    lat, lng = coords[cam_name]

    print(f"\n{'='*60}")
    print(f"Processing {cam_name}: {clip_path}")

    # Start RTSP loop stream + update stream_url in DB
    rtsp_path = cfg.get("rtsp_path")
    if rtsp_path:
        proc = start_rtsp_stream(cfg["file"], rtsp_path)
        if proc:
            _ffmpeg_procs.append(proc)
            time.sleep(1)  # give ffmpeg a moment to connect
        patch_stream_url(cam_name, rtsp_path)
    print(f"  Coordinates from DB: ({lat}, {lng})")
    print(f"{'='*60}")

    # Patch module-level MQTT topic so location_id in alerts = cam_name
    det_module.MQTT_TOPIC_STATUS = f"{cam_name}/status"
    det_module.MQTT_TOPIC_ALERT = f"{cam_name}/alert"
    det_module.MQTT_TOPIC_ACK = f"{cam_name}/ack"
    det_module.MQTT_TOPIC_ANALYTICS = f"{cam_name}/analytics"

    # Set env vars for CoordinateTranslator (reads at Detector init)
    os.environ["CAMERA_LAT"] = str(lat)
    os.environ["CAMERA_LONG"] = str(lng)

    detector = Detector(
        camera_id=cam_id,
        frame_skip=FRAME_SKIP,
        use_reid=False,
        reid_model=reid_model,
        imgsz=IMGSZ,
    )

    # Capture first alert params but defer POST until evidence video is saved
    clip_filename = os.path.basename(cfg["file"])  # e.g. "clip1.mp4"
    _pending_alert = {}

    def _patched_post(lat, lon, weapon_type, person_global_id, location_id):
        if _pending_alert:  # only keep the first detection
            return
        _pending_alert.update({"lat": lat, "lon": lon,
                               "weapon_type": weapon_type,
                               "person_global_id": person_global_id,
                               "location_id": location_id})

    detector._post_alert_to_backend = _patched_post

    cap = cv2.VideoCapture(clip_path)
    if not cap.isOpened():
        print(f"❌ Cannot open {clip_path}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps_src = cap.get(cv2.CAP_PROP_FPS) or 30
    print(f"  Frames: {total_frames}, Source FPS: {fps_src:.1f}")

    frame_count = 0
    start_time = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame_count += 1
        try:
            annotated, total_alerts, event_log = detector.process_frame(frame)
            if frame_count % 60 == 0 or (total_alerts > 0 and frame_count % 30 == 0):
                stats = detector.get_stats()
                elapsed = time.time() - start_time
                print(f"  [{frame_count}/{total_frames}] "
                      f"{frame_count/elapsed:.0f} fps | "
                      f"Alerts: {total_alerts} | "
                      f"Active: {stats['active_threats']}")
        except Exception as e:
            if frame_count <= 5:
                print(f"  ❌ Frame {frame_count}: {e}")

    elapsed = time.time() - start_time
    print(f"\n  ✅ {cam_name} done: {frame_count} frames in {elapsed:.1f}s "
          f"({frame_count/elapsed:.1f} fps)")
    print(f"  Total alerts fired: {detector.total_alerts}")

    cap.release()

    # Flush any in-progress recording to get the annotated evidence video
    detector.stop_recording()

    # POST the deferred alert with the annotated evidence video URL
    if _pending_alert:
        # Use detector's evidence video (annotated with bounding boxes)
        if hasattr(detector, 'final_filepath') and detector.final_filepath and \
                os.path.exists(detector.final_filepath):
            evidence_filename = os.path.basename(detector.final_filepath)
            evidence_url = f"{BACKEND_URL}/evidence/{evidence_filename}"
        else:
            # Fallback to raw clip if no evidence was recorded
            evidence_url = f"{BACKEND_URL}/clips/{clip_filename}"

        gid = _pending_alert.get("person_global_id")
        payload = {
            "lat": _pending_alert["lat"],
            "long": _pending_alert["lon"],
            "type": "weapon",
            "gcs_url": evidence_url,
            "person_id_hash": str(gid) if gid is not None else None,
            "location_id": _pending_alert["location_id"],
        }
        try:
            resp = requests.post(f"{BACKEND_URL}/alerts/cctv", json=payload, timeout=5)
            if resp.ok:
                print(f"  ✅ Alert POSTed: {_pending_alert['weapon_type']} "
                      f"GID={gid} → {evidence_url}")
            else:
                print(f"  ⚠️  Backend responded {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"  ⚠️  Failed to POST alert: {e}")
    try:
        detector.client.loop_stop()
        detector.client.disconnect()
    except Exception:
        pass


def main():
    from reidentification import PersonReID, REID_AVAILABLE

    print("="*60)
    print("NIGHTWALK — Multi-Clip Weapon Detection")
    print("="*60)

    # Fetch camera coordinates from backend
    print(f"\n>>> Fetching camera coordinates from {BACKEND_URL}...")
    coords = fetch_camera_coords()
    if coords:
        print(f">>> Found {len(coords)} cameras: {', '.join(coords.keys())}")
    else:
        print("⚠️  No cameras found. Register cam-001 and cam-002 in Settings first.")
        return

    # Shared ReID model for cross-camera person matching
    reid_model = None
    if USE_REID and REID_AVAILABLE:
        reid_model = PersonReID(device=REID_DEVICE)
        print(">>> Shared PersonReID initialized")
    elif USE_REID:
        print("⚠️  PersonReID not available — run: uv sync --extra reid")

    for cfg in CLIP_MAP:
        process_clip(cfg, coords, reid_model)

    print(f"\n{'='*60}")
    print("All clips processed. Check the dashboard for alerts.")
    print("If person has same GID across cameras, use Track Movement in the modal.")
    print("RTSP streams still running (press Ctrl+C to stop).")
    print(f"{'='*60}")

    # Keep ffmpeg streams alive until interrupted
    try:
        while any(p.poll() is None for p in _ffmpeg_procs):
            time.sleep(5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in _ffmpeg_procs:
            p.terminate()


if __name__ == "__main__":
    main()
