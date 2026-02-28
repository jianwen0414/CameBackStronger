import time
import subprocess
import threading
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv
from detector import Detector

# On macOS ffmpeg is bundled via imageio-ffmpeg; on Linux use system ffmpeg
if sys.platform == "darwin":
    import imageio_ffmpeg
    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
else:
    FFMPEG_BIN = "ffmpeg"

load_dotenv()

# --- CONFIG ---
_CAMERA_ID_ENV = os.getenv("CAMERA_ID", "-1")
# Support file path for demo mode (e.g. CAMERA_ID=clips/clip2.mp4)
try:
    CAMERA_ID = int(_CAMERA_ID_ENV)
except ValueError:
    CAMERA_ID = _CAMERA_ID_ENV  # file path string
CAP_WIDTH    = int(os.getenv("CAP_WIDTH",  640))
CAP_HEIGHT   = int(os.getenv("CAP_HEIGHT", 480))
CAP_FPS      = int(os.getenv("CAP_FPS",    30))
FRAME_SKIP   = int(os.getenv("FRAME_SKIP", 2))
IMGSZ        = int(os.getenv("IMGSZ",      416))
# MJPEG stream settings
MJPEG_PORT   = int(os.getenv("MJPEG_PORT", 8090))
STREAM_WIDTH  = int(os.getenv("STREAM_WIDTH",  1280))
STREAM_HEIGHT = int(os.getenv("STREAM_HEIGHT", 720))
STREAM_FPS    = int(os.getenv("STREAM_FPS",    30))
JPEG_QUALITY  = int(os.getenv("JPEG_QUALITY",  100))
# Optional RTSP via ffmpeg→MediaMTX (set ENABLE_RTSP=1 to enable)
ENABLE_RTSP      = os.getenv("ENABLE_RTSP", "0") == "1"
RTSP_URL         = os.getenv("RTSP_URL",     "rtsp://localhost:8554/mystream")
ENABLE_RAW_STREAM = os.getenv("ENABLE_RAW_STREAM", "0") == "1"
RTSP_URL_RAW     = os.getenv("RTSP_URL_RAW", "rtsp://localhost:8554/mystream-raw")
# Set DEMO_GID to force a fixed person_id for all alerts (demo mode only)
DEMO_GID     = os.getenv("DEMO_GID")


# ============================================================================
# MJPEG HTTP streaming server — zero latency, no ffmpeg/MediaMTX needed
# ============================================================================

_latest_jpeg = None
_jpeg_cond   = threading.Condition()
_jpeg_seq    = 0  # increments on each new frame


def _update_jpeg(frame):
    """Called from main loop to publish the latest annotated frame."""
    global _latest_jpeg, _jpeg_seq
    small = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
    _, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    with _jpeg_cond:
        _latest_jpeg = buf.tobytes()
        _jpeg_seq += 1
        _jpeg_cond.notify_all()


class _MJPEGHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        last_seq = 0
        try:
            while True:
                with _jpeg_cond:
                    # Wait until a genuinely new frame is available
                    _jpeg_cond.wait_for(lambda: _jpeg_seq > last_seq, timeout=2.0)
                    jpeg = _latest_jpeg
                    last_seq = _jpeg_seq
                if jpeg is None:
                    continue
                self.wfile.write(b'--frame\r\n')
                self.wfile.write(b'Content-Type: image/jpeg\r\n\r\n')
                self.wfile.write(jpeg)
                self.wfile.write(b'\r\n')
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, fmt, *args):
        pass


def _start_mjpeg_server():
    from http.server import ThreadingHTTPServer
    server = ThreadingHTTPServer(('0.0.0.0', MJPEG_PORT), _MJPEGHandler)
    server.daemon_threads = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


# ============================================================================
# Threaded camera capture
# ============================================================================

class ThreadedCapture:
    """
    Reads camera/file frames in a background thread so the inference loop
    never blocks waiting on cap.read(). File sources loop automatically.
    """
    def __init__(self, source, width: int, height: int, fps: int):
        self._source = source
        self._width  = width
        self._height = height
        self._fps    = fps
        self._is_file = isinstance(source, str)
        self.cap = self._open()

        self._lock  = threading.Lock()
        self._stop  = threading.Event()
        self.ok, self.frame = self.cap.read()

        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def _open(self):
        cap = cv2.VideoCapture(self._source)
        if not self._is_file:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self._width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
            cap.set(cv2.CAP_PROP_FPS,          self._fps)
        return cap

    def _reader(self):
        _frame_interval = (1.0 / self._fps) if self._is_file else 0.0
        while not self._stop.is_set():
            t0 = time.time()
            ok, frame = self.cap.read()
            if not ok and self._is_file:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.cap.read()
            with self._lock:
                self.ok    = ok
                self.frame = frame
            if _frame_interval:
                elapsed = time.time() - t0
                wait = _frame_interval - elapsed
                if wait > 0:
                    time.sleep(wait)

    def read(self):
        with self._lock:
            return self.ok, self.frame.copy() if self.frame is not None else None

    def release(self):
        self._stop.set()
        self._thread.join()
        self.cap.release()


import cv2

# ============================================================================
# Initialization
# ============================================================================

# 1. Camera
camera = ThreadedCapture(CAMERA_ID, CAP_WIDTH, CAP_HEIGHT, CAP_FPS)

W   = int(camera.cap.get(cv2.CAP_PROP_FRAME_WIDTH))  or CAP_WIDTH
H   = int(camera.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or CAP_HEIGHT
FPS = int(camera.cap.get(cv2.CAP_PROP_FPS))          or CAP_FPS

# 2. Set MQTT topics to match camera name (CAM-001) so analytics overlay finds them
import detector as det_module
_cam_name = os.getenv("CAMERA_NAME", "CAM-001")
det_module.MQTT_TOPIC_STATUS    = f"{_cam_name}/status"
det_module.MQTT_TOPIC_ALERT     = f"{_cam_name}/alert"
det_module.MQTT_TOPIC_ACK       = f"{_cam_name}/ack"
det_module.MQTT_TOPIC_ANALYTICS = f"{_cam_name}/analytics"

# 3. AI detector
detector = Detector(
    camera_id=CAMERA_ID if isinstance(CAMERA_ID, int) else 1,
    frame_skip=FRAME_SKIP,
    imgsz=IMGSZ,
    use_reid=True,
    reid_device="cuda",
)

if DEMO_GID:
    _orig_post = detector._post_alert_to_backend
    def _demo_post(lat, lon, weapon_type, person_global_id, location_id):
        _orig_post(lat, lon, weapon_type, int(DEMO_GID), location_id)
    detector._post_alert_to_backend = _demo_post
    print(f">>> DEMO MODE: all alerts will use GID={DEMO_GID}")

# 3. MJPEG server (primary — always on)
mjpeg_server = _start_mjpeg_server()
print(f">>> MJPEG stream: http://localhost:{MJPEG_PORT}/")

# 4. Optional RTSP via ffmpeg (disabled by default — set ENABLE_RTSP=1)
ffmpeg_process = None
ffmpeg_process_raw = None
if ENABLE_RTSP:
    def _make_ffmpeg_cmd(rtsp_url):
        return [
            'ffmpeg', '-y',
            '-f', 'rawvideo', '-vcodec', 'rawvideo',
            '-pix_fmt', 'bgr24',
            '-s', f'{STREAM_WIDTH}x{STREAM_HEIGHT}',
            '-r', str(STREAM_FPS),
            '-i', '-',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
            '-pix_fmt', 'yuv420p',
            '-f', 'rtsp', '-rtsp_transport', 'tcp', rtsp_url,
        ]
    ffmpeg_cmd = _make_ffmpeg_cmd(RTSP_URL)
    ffmpeg_process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
    print(f"    RTSP → {RTSP_URL}")
    if ENABLE_RAW_STREAM:
        ffmpeg_cmd_raw = _make_ffmpeg_cmd(RTSP_URL_RAW)
        ffmpeg_process_raw = subprocess.Popen(ffmpeg_cmd_raw, stdin=subprocess.PIPE)
        print(f"    RTSP raw → {RTSP_URL_RAW}")

print(f">>> Edge AI Started. Source {W}x{H} @ {FPS}fps, stream {STREAM_WIDTH}x{STREAM_HEIGHT}")

# ============================================================================
# Main loop
# ============================================================================

try:
    while True:
        ok, frame = camera.read()
        if not ok or frame is None:
            continue

        annotated_frame, _total_alerts, _event_log = detector.process_frame(frame)

        # Publish to MJPEG server (always)
        _update_jpeg(annotated_frame)

        # Optional RTSP pipe
        if ffmpeg_process is not None:
            small = cv2.resize(annotated_frame, (STREAM_WIDTH, STREAM_HEIGHT))
            try:
                ffmpeg_process.stdin.write(small.tobytes())
            except BrokenPipeError:
                ffmpeg_process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
            if ffmpeg_process_raw is not None:
                raw_small = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
                try:
                    ffmpeg_process_raw.stdin.write(raw_small.tobytes())
                except BrokenPipeError:
                    ffmpeg_process_raw = subprocess.Popen(ffmpeg_cmd_raw, stdin=subprocess.PIPE)

except KeyboardInterrupt:
    print("\n>>> Shutting down...")

finally:
    camera.release()
    if ffmpeg_process:
        ffmpeg_process.stdin.close()
        ffmpeg_process.wait()
    if ffmpeg_process_raw:
        ffmpeg_process_raw.stdin.close()
        ffmpeg_process_raw.wait()
    print(">>> Stopped.")
