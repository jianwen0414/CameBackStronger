import cv2
import threading
import time

class CameraService:
    def __init__(self, source=0):
        self.source = source
        self.cap = cv2.VideoCapture(self.source)
        self.lock = threading.Lock()
        self.current_frame = None
        self.running = True
        
        # Start background thread immediately
        self.thread = threading.Thread(target=self._capture_loop)
        self.thread.daemon = True
        self.thread.start()

    def _capture_loop(self):
        while self.running:
            success, frame = self.cap.read()
            if success:
                with self.lock:
                    self.current_frame = frame
            time.sleep(0.01) # Small sleep to prevent CPU hogging

    def get_frame(self):
        with self.lock:
            if self.current_frame is None:
                return None
            return self.current_frame.copy()

    def stop(self):
        self.running = False
        self.cap.release()