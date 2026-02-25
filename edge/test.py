#!/usr/bin/env python3
"""
Test script for Fast Weapon Detector
Optimized for higher FPS
"""
import cv2
from detector import Detector
import time
import threading


class ThreadedCapture:
    """
    Reads camera frames in a background thread so cap.read()
    never blocks the inference loop.
    """
    def __init__(self, source: int, width: int, height: int, fps: int):
        self.cap = cv2.VideoCapture(source)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.cap.set(cv2.CAP_PROP_FPS, fps)

        self.frame = None
        self.ok = False
        self._lock = threading.Lock()
        self._stop = threading.Event()

        # Prime with first frame
        self.ok, self.frame = self.cap.read()

        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def _reader(self):
        while not self._stop.is_set():
            ok, frame = self.cap.read()
            with self._lock:
                self.ok = ok
                self.frame = frame

    def read(self):
        with self._lock:
            return self.ok, self.frame.copy() if self.frame is not None else None

    def release(self):
        self._stop.set()
        self._thread.join()
        self.cap.release()


def main():
    print("="*60)
    print("FAST WEAPON DETECTOR TEST")
    print("="*60)

    # Performance settings
    CAMERA_ID  = 0
    FRAME_SKIP = 2       # Process every Nth frame (1=all, 2=half, 3=third)
    USE_REID   = False    # Enable PersonReID (requires torchreid)
    REID_DEVICE = "cpu"   # or "cuda" if you have GPU

    # Resolution — keep capture small; this is the #1 FPS lever.
    # 640×480 typically delivers 30 fps over USB 2.0.
    # 1280×720 often caps at ~5-7 fps on USB 2.0.
    CAP_WIDTH  = 640
    CAP_HEIGHT = 480
    CAP_FPS    = 30

    # YOLO inference resolution (smaller = faster, e.g. 416, 320)
    IMGSZ = 640

    print(f"\nSettings:")
    print(f"  Camera ID:    {CAMERA_ID}")
    print(f"  Capture:      {CAP_WIDTH}×{CAP_HEIGHT} @ {CAP_FPS} fps")
    print(f"  YOLO imgsz:   {IMGSZ}")
    print(f"  Frame Skip:   {FRAME_SKIP} (process 1/{FRAME_SKIP} frames)")
    print(f"  PersonReID:   {'Enabled' if USE_REID else 'Disabled'}")
    if USE_REID:
        print(f"  ReID Device:  {REID_DEVICE}")
    print()

    print(">>> Initializing Fast Weapon Detector...")
    detector = Detector(
        camera_id=CAMERA_ID,
        frame_skip=FRAME_SKIP,
        use_reid=USE_REID,
        reid_device=REID_DEVICE,
        imgsz=IMGSZ,
    )

    print(">>> Opening webcam (threaded)...")
    cap = ThreadedCapture(CAMERA_ID, CAP_WIDTH, CAP_HEIGHT, CAP_FPS)

    if not cap.ok:
        print("❌ Error: Could not open webcam")
        return

    print(">>> Starting detection loop. Press 'q' to quit, 's' to screenshot.")
    print()

    frame_count    = 0
    start_time     = time.time()
    inference_times = []
    annotated_frame = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                print("❌ Error: Could not read frame")
                break

            try:
                infer_start = time.time()
                annotated_frame, total_alerts, event_log = detector.process_frame(frame)
                infer_time = (time.time() - infer_start) * 1000  # ms
                inference_times.append(infer_time)

                if len(inference_times) > 30:
                    inference_times.pop(0)

                frame_count += 1
                elapsed = time.time() - start_time
                fps     = frame_count / elapsed if elapsed > 0 else 0
                avg_infer = sum(inference_times) / len(inference_times)

                cv2.putText(annotated_frame, f"FPS: {fps:.1f}", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(annotated_frame, f"Inference: {avg_infer:.1f}ms", (10, 70),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(annotated_frame, f"Alerts: {total_alerts}", (10, 110),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                cv2.imshow('Fast Weapon Detection', annotated_frame)

                if frame_count % 60 == 0:
                    stats = detector.get_stats()
                    print(f"[{frame_count:04d}] FPS: {fps:.1f} | "
                          f"Inference: {avg_infer:.1f}ms | "
                          f"Threats: {stats['active_threats']}")

            except Exception as e:
                print(f"❌ Error processing frame {frame_count}: {e}")
                if frame is not None:
                    cv2.imshow('Fast Weapon Detection', frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                print(">>> Quit requested")
                break
            elif key == ord('s') and annotated_frame is not None:
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                filename = f"screenshot_{timestamp}.jpg"
                cv2.imwrite(filename, annotated_frame)
                print(f">>> Screenshot saved: {filename}")

    except KeyboardInterrupt:
        print("\n>>> Interrupted by user")

    finally:
        print()
        print("="*60)
        print("PERFORMANCE SUMMARY")
        print("="*60)
        elapsed_total = time.time() - start_time
        print(f"Total frames:      {frame_count}")
        print(f"Total time:        {elapsed_total:.1f}s")
        print(f"Average FPS:       {frame_count / elapsed_total:.1f}")
        if inference_times:
            print(f"Average inference: {sum(inference_times)/len(inference_times):.1f}ms")
        print("="*60)

        print(">>> Cleaning up...")
        cap.release()
        cv2.destroyAllWindows()
        print(">>> Test complete")


if __name__ == "__main__":
    main()
