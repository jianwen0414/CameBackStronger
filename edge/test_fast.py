#!/usr/bin/env python3
"""
Test script for Fast Weapon Detector
Optimized for higher FPS
"""
import cv2
from weapon_detector_fast import WeaponDetectorFast
import time

def main():
    print("="*60)
    print("FAST WEAPON DETECTOR TEST")
    print("="*60)

    # Performance settings
    CAMERA_ID = 0
    FRAME_SKIP = 2        # Process every 2nd frame (1=all, 2=half, 3=third)
    USE_REID = False      # Enable PersonReID (requires torchreid)
    REID_DEVICE = "cpu"   # or "cuda" if you have GPU

    print(f"\nSettings:")
    print(f"  Camera ID: {CAMERA_ID}")
    print(f"  Frame Skip: {FRAME_SKIP} (process 1/{FRAME_SKIP} frames)")
    print(f"  PersonReID: {'Enabled' if USE_REID else 'Disabled'}")
    if USE_REID:
        print(f"  ReID Device: {REID_DEVICE}")
    print()

    print(">>> Initializing Fast Weapon Detector...")
    detector = WeaponDetectorFast(
        camera_id=CAMERA_ID,
        frame_skip=FRAME_SKIP,
        use_reid=USE_REID,
        reid_device=REID_DEVICE
    )

    print(">>> Opening webcam...")
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("❌ Error: Could not open webcam")
        return

    # Set camera resolution (lower = faster capture)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    print(">>> Starting detection loop. Press 'q' to quit.")
    print()

    frame_count = 0
    start_time = time.time()
    inference_times = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("❌ Error: Could not read frame")
                break

            try:
                # Measure inference time
                infer_start = time.time()
                annotated_frame, total_alerts, event_log = detector.process_frame(frame)
                infer_time = (time.time() - infer_start) * 1000  # ms
                inference_times.append(infer_time)

                # Keep last 30 inference times for average
                if len(inference_times) > 30:
                    inference_times.pop(0)

                # Calculate FPS
                frame_count += 1
                elapsed = time.time() - start_time
                fps = frame_count / elapsed if elapsed > 0 else 0
                avg_infer = sum(inference_times) / len(inference_times)

                # Add performance metrics to frame
                cv2.putText(annotated_frame, f"FPS: {fps:.1f}", (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                cv2.putText(annotated_frame, f"Inference: {avg_infer:.1f}ms", (10, 70),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                cv2.putText(annotated_frame, f"Alerts: {total_alerts}", (10, 110),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                # Display frame
                cv2.imshow('Fast Weapon Detection', annotated_frame)

                # Print stats every 60 frames
                if frame_count % 60 == 0:
                    stats = detector.get_stats()
                    print(f"[{frame_count:04d}] FPS: {fps:.1f} | "
                          f"Inference: {avg_infer:.1f}ms | "
                          f"Threats: {stats['active_threats']}")

            except Exception as e:
                print(f"❌ Error processing frame {frame_count}: {e}")
                cv2.imshow('Fast Weapon Detection', frame)

            # Check for quit key
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                print(">>> Quit requested")
                break
            elif key == ord('s'):
                # Save screenshot
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
        print(f"Total frames: {frame_count}")
        print(f"Total time: {elapsed_total:.1f}s")
        print(f"Average FPS: {frame_count/elapsed_total:.1f}")
        print(f"Average inference: {sum(inference_times)/len(inference_times):.1f}ms")
        print("="*60)

        print(">>> Cleaning up...")
        cap.release()
        cv2.destroyAllWindows()
        print(">>> Test complete")

if __name__ == "__main__":
    main()
