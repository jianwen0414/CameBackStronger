import time
import subprocess
import threading
import os
from dotenv import load_dotenv
from detector import Detector

load_dotenv()

# --- CONFIG ---
CAMERA_ID    = int(os.getenv("CAMERA_ID", -1))
CAP_WIDTH    = int(os.getenv("CAP_WIDTH",  640))
CAP_HEIGHT   = int(os.getenv("CAP_HEIGHT", 480))
CAP_FPS      = int(os.getenv("CAP_FPS",    30))
FRAME_SKIP   = int(os.getenv("FRAME_SKIP", 2))
IMGSZ        = int(os.getenv("IMGSZ",      416))
RTSP_URL     = os.getenv("RTSP_URL",     "rtsp://localhost:8554/mystream")
RTSP_URL_RAW = os.getenv("RTSP_URL_RAW", "rtsp://localhost:8554/mystream-raw")


class ThreadedCapture:
    """
    Reads camera frames in a background thread so the inference loop
    never blocks waiting on cap.read().
    """
    def __init__(self, source: int, width: int, height: int, fps: int):
        self.cap = cv2.VideoCapture(source)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.set(cv2.CAP_PROP_FPS, fps)

        self._lock  = threading.Lock()
        self._stop  = threading.Event()
        self.ok, self.frame = self.cap.read()

        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def _reader(self):
        while not self._stop.is_set():
            ok, frame = self.cap.read()
            with self._lock:
                self.ok    = ok
                self.frame = frame

    def read(self):
        with self._lock:
            return self.ok, self.frame.copy() if self.frame is not None else None

    def release(self):
        self._stop.set()
        self._thread.join()
        self.cap.release()


import cv2  # imported after class def to keep cv2 dependency localised

# 1. Camera (threaded capture for max FPS)
camera = ThreadedCapture(CAMERA_ID, CAP_WIDTH, CAP_HEIGHT, CAP_FPS)

# 2. AI detector (handles MQTT + video recording internally)
detector = Detector(
    camera_id=CAMERA_ID,
    frame_skip=FRAME_SKIP,
    imgsz=IMGSZ,
    use_reid=True,      # ← add this
    reid_device="cuda",  # or "cuda"
)

# 3. FFmpeg RTSP streamers
def _make_ffmpeg_cmd(rtsp_url: str) -> list[str]:
    return [
        'ffmpeg', '-y',
        '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-pix_fmt', 'bgr24',
        '-s', f'{CAP_WIDTH}x{CAP_HEIGHT}',
        '-r', str(CAP_FPS),
        '-i', '-',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-f', 'rtsp', rtsp_url,
    ]

ffmpeg_cmd     = _make_ffmpeg_cmd(RTSP_URL)
ffmpeg_cmd_raw = _make_ffmpeg_cmd(RTSP_URL_RAW)

ffmpeg_process     = subprocess.Popen(ffmpeg_cmd,     stdin=subprocess.PIPE)
ffmpeg_process_raw = subprocess.Popen(ffmpeg_cmd_raw, stdin=subprocess.PIPE)

print(f">>> Edge AI Started. Streaming {CAP_WIDTH}x{CAP_HEIGHT} @ {CAP_FPS}fps")
print(f"    Annotated → {RTSP_URL}")
print(f"    Raw       → {RTSP_URL_RAW}")

try:
    while True:
        # A. Get latest frame (non-blocking — threaded reader always has one ready)
        ok, frame = camera.read()
        if not ok or frame is None:
            continue

        # B. Run AI detection (state machine + MQTT + recording handled internally)
        annotated_frame, _total_alerts, _event_log = detector.process_frame(frame)

        # C. Stream annotated video to MediaMTX via FFmpeg
        try:
            ffmpeg_process.stdin.write(annotated_frame.tobytes())
        except BrokenPipeError:
            print("⚠️  FFmpeg pipe broken — restarting FFmpeg...")
            ffmpeg_process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

        # D. Stream raw (no bounding box) video on the secondary RTSP path
        try:
            ffmpeg_process_raw.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print("⚠️  FFmpeg raw pipe broken — restarting raw FFmpeg...")
            ffmpeg_process_raw = subprocess.Popen(ffmpeg_cmd_raw, stdin=subprocess.PIPE)

except KeyboardInterrupt:
    print("\n>>> Shutting down...")

finally:
    camera.release()
    ffmpeg_process.stdin.close()
    ffmpeg_process.wait()
    ffmpeg_process_raw.stdin.close()
    ffmpeg_process_raw.wait()
    print(">>> Stopped.")
