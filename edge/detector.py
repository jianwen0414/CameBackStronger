"""
Optimized WeaponDetector with PersonReID and ByteTrack
Uses Ultralytics YOLO with ONNX model for weapon detection
Integrates with tracker/tracker.py and reidentification.py
"""
from ultralytics import YOLO
import numpy as np
import time
import math
import cv2
import os
import json
from datetime import datetime
import paho.mqtt.client as mqtt
from collections import deque
import subprocess
from dotenv import load_dotenv
import threading
from google.cloud import storage
from enum import Enum, auto

# Import from existing modules
from tracker.tracker import Tracker, _iou
from reidentification import PersonReID
REID_AVAILABLE = True

load_dotenv()

# --- CONFIGURATION ---
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
MQTT_TOPIC_STATUS = os.getenv("MQTT_TOPIC_STATUS", "cam-01/status")
MQTT_TOPIC_ALERT = os.getenv("MQTT_TOPIC_ALERT", "cam-01/alert")
MQTT_TOPIC_ACK = os.getenv("MQTT_TOPIC_ACK", "cam-01/ack")

APP_ENV = os.getenv("APP_ENV", "dev")
GCP_BUCKET_NAME = os.getenv("GCP_BUCKET_NAME", "evidence-clips")

# YOLO class indices
CLS_GUN = 0
CLS_KNIFE = 1
CLS_PERSON = 2

WEAPON_CLASSES = {CLS_GUN, CLS_KNIFE}
WEAPON_LABELS = {CLS_GUN: "Gun", CLS_KNIFE: "Knife"}


class WeaponOwnership(Enum):
    """State machine for each tracked weapon."""
    UNOWNED = auto()
    CONFIRMING = auto()
    OWNED = auto()
    LOCKED_ORPHAN = auto()


class WeaponState:
    """Per-weapon tracking state with ownership."""
    def __init__(self, weapon_id: int, weapon_cls: int):
        self.weapon_id = weapon_id
        self.weapon_cls = weapon_cls
        self.status = WeaponOwnership.UNOWNED
        self.owner_track_id = None
        self.owner_global_id = -1
        self.candidate_track_id = None
        self.confirm_frames = 0
        self.orphan_frames = 0


class Detector:
    """
    Fast weapon detector with PersonReID and ByteTrack integration.

    Optimizations:
    - Frame skipping for higher FPS
    - GPU acceleration via Ultralytics
    - Reduced buffer sizes
    - Optional PersonReID for cross-camera tracking
    """

    # Colors (BGR)
    _COLOUR_WEAPON = (0, 0, 255)      # Red
    _COLOUR_OWNED = (0, 255, 0)       # Green
    _COLOUR_CONFIRMING = (0, 165, 255)  # Orange
    _COLOUR_ORPHAN = (128, 0, 128)    # Purple
    _COLOUR_PERSON = (255, 0, 0)      # Blue

    def __init__(
        self,
        camera_id: int = 0,
        frame_skip: int = 2,
        use_reid: bool = False,
        reid_device: str = "cpu",
        iou_threshold: float = 0.01,
        confirm_frames: int = 5,
        orphan_timeout_frames: int = 150,
        imgsz: int = 416,
    ):
        """
        Args:
            camera_id: Camera ID for this detector
            frame_skip: Process every Nth frame (1=all, 2=half, 3=third)
            use_reid: Enable PersonReID for cross-camera tracking
            reid_device: 'cpu' or 'cuda' for ReID model
            iou_threshold: Min IoU overlap to associate a weapon with a person
            confirm_frames: Frames needed to confirm ownership
            orphan_timeout_frames: Frames before orphaned weapon is released
            imgsz: YOLO inference resolution (smaller = faster, e.g. 416 or 320)
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))

        # Try ONNX first, fallback to PT
        onnx_path = os.path.join(base_dir, 'model', 'bestv4.onnx')
        pt_path = os.path.join(base_dir, 'model', 'bestv4.pt')

        if os.path.exists(onnx_path):
            model_path = onnx_path
            print(f">>> Loading ONNX model: {onnx_path}")
        elif os.path.exists(pt_path):
            model_path = pt_path
            print(f">>> Loading PT model: {pt_path}")
        else:
            raise FileNotFoundError("No model found (best.onnx or best.pt)")

        # Load YOLO model (Ultralytics handles ONNX automatically)
        self.yolo_model = YOLO(model_path)
        print(f">>> Model loaded: {model_path}")

        self.camera_id = camera_id
        self.frame_skip = frame_skip
        self.frame_counter = 0
        self.imgsz = imgsz

        # Weapon association parameters
        self.iou_threshold = iou_threshold
        self.confirm_frames_needed = confirm_frames
        self.orphan_timeout_frames = orphan_timeout_frames

        # Weapon states
        self._weapon_states = {}  # {weapon_track_id: WeaponState}

        # PersonReID (optional)
        self.reid_model = None
        if use_reid and REID_AVAILABLE:
            try:
                self.reid_model = PersonReID(
                    model_name="osnet_x1_0",
                    device=reid_device
                )
                self.reid_every_n_frames = 5
                print(">>> PersonReID enabled")
            except Exception as e:
                print(f"⚠️  PersonReID init failed: {e}")
                self.reid_model = None
        elif use_reid:
            print("⚠️  PersonReID not available (install torchreid)")

        # Event tracking
        self.event_log = []
        self.total_alerts = 0
        self.acknowledged_detections = {}

        # MQTT
        self.client = mqtt.Client()
        self.is_alarm_active = False
        self.client.on_message = self.on_mqtt_message

        try:
            self.client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT)
            self.client.subscribe(MQTT_TOPIC_ACK)
            self.client.loop_start()
            self.mqtt_connected = True
            print(f">>> MQTT Connected")
        except Exception as e:
            self.mqtt_connected = False
            print(f"⚠️  MQTT Connection Failed: {e}")

        # Video recording (reduced buffers)
        self.is_recording = False
        self.video_writer = None
        self.recording_start_time = 0
        self.fps_estimate = 20
        self.pre_event_seconds = 10
        self.post_event_seconds = 10

        self.video_codecs = ['mp4v', 'avc1', 'H264', 'X264', 'XVID', 'MJPG']
        self.working_codec = None

        buffer_size = self.fps_estimate * self.pre_event_seconds
        self.frame_buffer = deque(maxlen=buffer_size)

        self.output_dir = "evidence"
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

        # Cloud storage
        self.storage_client = None
        if APP_ENV == "prod":
            try:
                self.storage_client = storage.Client()
                print(f">>> ☁️  GCP Storage Initialized")
            except Exception as e:
                print(f"❌ GCP Init Failed: {e}")

        # Cache for frame skipping
        self.last_annotated_frame = None
        self.last_threats = []

    def on_mqtt_message(self, client, userdata, msg):
        try:
            if msg.topic == MQTT_TOPIC_ACK:
                track_id_str = msg.payload.decode()
                self.acknowledge_alert(track_id_str)
        except Exception as e:
            print(f"❌ Error processing Ack: {e}")

    def process_frame(self, frame):
        """
        Process frame with YOLO + ByteTrack + PersonReID
        Returns: (annotated_frame, total_alerts, event_log)
        """
        self.frame_counter += 1
        current_time = time.time()

        # Frame skipping for FPS boost
        if self.frame_counter % self.frame_skip != 0:
            if self.last_annotated_frame is not None:
                self.frame_buffer.append(self.last_annotated_frame)
                return self.last_annotated_frame, self.total_alerts, self.event_log
            else:
                return frame, self.total_alerts, self.event_log

        # Run YOLO with ByteTrack
        # conf=0.35: knives are small and often score below 0.5 — lowering this
        # lets them reach the tracker. False positives are suppressed downstream
        # by the state machine's confirm_frames=5 gate before any alert fires.
        results = self.yolo_model.track(
            frame,
            persist=True,
            tracker="tracker/bytetrack.yaml",
            classes=list(WEAPON_CLASSES) + [CLS_PERSON],
            conf=0.35,
            imgsz=self.imgsz,
            verbose=False,
        )

        # Parse detections
        persons = {}  # {track_id: {bbox, conf}}
        weapons = {}  # {track_id: {bbox, conf, cls}}

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy().astype(int)
            confs = results[0].boxes.conf.cpu().numpy()
            classes = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, conf, cls in zip(boxes, track_ids, confs, classes):
                x1, y1, x2, y2 = map(int, box)
                entry = {"bbox": (x1, y1, x2, y2), "conf": float(conf)}

                if cls == CLS_PERSON:
                    persons[tid] = entry
                elif cls in WEAPON_CLASSES:
                    entry["cls"] = cls
                    weapons[tid] = entry

        # PersonReID feature extraction
        if self.reid_model is not None:
            # Extract features for confirmed holders and candidates
            confirmed_holders = {
                state.owner_track_id
                for state in self._weapon_states.values()
                if state.status == WeaponOwnership.OWNED
                and state.owner_track_id is not None
            }

            candidate_holders = {
                state.candidate_track_id
                for state in self._weapon_states.values()
                if state.status == WeaponOwnership.UNOWNED
                and state.candidate_track_id is not None
            }

            reid_targets = confirmed_holders | candidate_holders

            if reid_targets and self.frame_counter % self.reid_every_n_frames == 0:
                for pid in reid_targets:
                    if pid in persons:
                        x1, y1, x2, y2 = persons[pid]["bbox"]
                        crop = frame[y1:y2, x1:x2]
                        feats = self.reid_model.extract_features(crop)
                        self.reid_model.update_features(self.camera_id, pid, feats)

            # Run ReID matching
            if self.reid_model.camera_features:
                matches = self.reid_model.find_cross_camera_matches(threshold=0.70)
                self.reid_model.assign_global_ids(matches)

        # Prune lost weapons
        active_weapon_ids = set(weapons.keys())
        lost = [wid for wid in self._weapon_states if wid not in active_weapon_ids]
        for wid in lost:
            del self._weapon_states[wid]

        # Update weapon state machine
        for wid, winfo in weapons.items():
            if wid not in self._weapon_states:
                self._weapon_states[wid] = WeaponState(wid, winfo["cls"])

            state = self._weapon_states[wid]

            # Find person with highest IoU overlap above threshold
            nearest_pid = None
            best_iou = self.iou_threshold
            for pid, pinfo in persons.items():
                iou = _iou(np.array(winfo["bbox"]), np.array(pinfo["bbox"]))
                if iou > best_iou:
                    best_iou = iou
                    nearest_pid = pid

            # State transitions
            if state.status == WeaponOwnership.UNOWNED:
                if nearest_pid is not None:
                    if state.candidate_track_id == nearest_pid:
                        state.confirm_frames += 1
                    else:
                        state.candidate_track_id = nearest_pid
                        state.confirm_frames = 1

                    if state.confirm_frames >= self.confirm_frames_needed:
                        # Lock ownership
                        state.status = WeaponOwnership.OWNED
                        state.owner_track_id = nearest_pid
                        if self.reid_model is not None:
                            state.owner_global_id = self.reid_model.get_global_id(
                                self.camera_id, nearest_pid
                            )
                        state.confirm_frames = 0
                        state.candidate_track_id = None
                else:
                    state.candidate_track_id = None
                    state.confirm_frames = 0

            elif state.status == WeaponOwnership.OWNED:
                owner_in_frame = state.owner_track_id in persons

                if not owner_in_frame:
                    # Try ReID re-link
                    if self.reid_model is not None and state.owner_global_id >= 0:
                        relinked = self._relink_by_reid(
                            self.camera_id, state.owner_global_id, persons
                        )
                        if relinked is not None:
                            state.owner_track_id = relinked
                            owner_in_frame = True

                if not owner_in_frame:
                    # Enter orphan state
                    state.status = WeaponOwnership.LOCKED_ORPHAN
                    state.orphan_frames = 0

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                state.orphan_frames += 1

                # Try to re-link
                if self.reid_model is not None and state.owner_global_id >= 0:
                    relinked = self._relink_by_reid(
                        self.camera_id, state.owner_global_id, persons
                    )
                    if relinked is not None:
                        state.owner_track_id = relinked
                        state.status = WeaponOwnership.OWNED
                        state.orphan_frames = 0
                        continue

                # Timeout - release ownership
                if state.orphan_frames >= self.orphan_timeout_frames:
                    state.status = WeaponOwnership.UNOWNED
                    state.owner_track_id = None
                    state.owner_global_id = -1
                    state.orphan_frames = 0

        # Draw annotations and collect threats
        annotated = frame.copy()
        threats = []
        frame_has_active_threat = False

        # Draw persons
        for pid, pinfo in persons.items():
            x1, y1, x2, y2 = pinfo["bbox"]
            colour = self._person_colour(self.camera_id, pid)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)

            gid = (
                self.reid_model.get_global_id(self.camera_id, pid)
                if self.reid_model else -1
            )
            label = f"P{pid}" if gid < 0 else f"P{pid}[G{gid}]"
            self._put_label(annotated, label, (x1, y1), colour)

        # Draw weapons + association
        for wid, winfo in weapons.items():
            state = self._weapon_states[wid]
            wx1, wy1, wx2, wy2 = winfo["bbox"]
            wcx, wcy = self._center(winfo["bbox"])
            wlabel = WEAPON_LABELS.get(winfo["cls"], "Weapon")

            if state.status == WeaponOwnership.OWNED and state.owner_track_id in persons:
                # Confirmed owner
                pinfo = persons[state.owner_track_id]
                pcx, pcy = self._center(pinfo["bbox"])
                gid = state.owner_global_id
                gid_tag = f"[G{gid}]" if gid >= 0 else ""

                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_OWNED, 3)
                cv2.line(annotated, (int(wcx), int(wcy)), (int(pcx), int(pcy)),
                        self._COLOUR_OWNED, 2)
                self._put_label(annotated, f"⚠{wlabel}{gid_tag}", (wx1, wy1),
                               self._COLOUR_OWNED)

                # Record threat
                frame_has_active_threat = True
                threats.append({
                    "camera_id": self.camera_id,
                    "person_track": state.owner_track_id,
                    "weapon_track": wid,
                    "weapon_type": wlabel,
                    "confidence": winfo["conf"],
                    "bbox_person": pinfo["bbox"],
                    "bbox_weapon": winfo["bbox"],
                })

                # Add to event log
                if wid not in self.acknowledged_detections:
                    active_log_ids = [l['weapon_track'] for l in self.event_log if l.get('active')]
                    if wid not in active_log_ids:
                        new_event = {
                            "weapon_track": wid,
                            "person_track": state.owner_track_id,
                            "id": f"{wlabel}_{self.total_alerts}",
                            "date": datetime.now().strftime("%Y-%m-%d"),
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "weapon_type": wlabel,
                            "confidence": f"{winfo['conf']:.2f}",
                            "type": "WEAPON_ALERT",
                            "active": True
                        }
                        self.event_log.insert(0, new_event)
                        self.total_alerts += 1

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_ORPHAN, 3)
                remaining = self.orphan_timeout_frames - state.orphan_frames
                self._put_label(annotated, f"⚠{wlabel}[ORPHAN {remaining}f]",
                               (wx1, wy1), self._COLOUR_ORPHAN)

            elif state.status == WeaponOwnership.UNOWNED and state.candidate_track_id:
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_CONFIRMING, 2)
                progress = state.confirm_frames
                needed = self.confirm_frames_needed
                self._put_label(annotated, f"{wlabel}[{progress}/{needed}]",
                               (wx1, wy1), self._COLOUR_CONFIRMING)

            else:
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_WEAPON, 2)
                self._put_label(annotated, wlabel, (wx1, wy1), self._COLOUR_WEAPON)

        # Cache for skipped frames
        self.last_annotated_frame = annotated
        self.last_threats = threats

        # MQTT (publish less frequently)
        if self.mqtt_connected and self.frame_counter % 10 == 0:
            try:
                stats = self.get_stats()
                self.client.publish(MQTT_TOPIC_STATUS, json.dumps(stats))

                if frame_has_active_threat and not self.is_alarm_active:
                    self.client.publish(MQTT_TOPIC_ALERT, "ON")
                    self.is_alarm_active = True
                elif not frame_has_active_threat and self.is_alarm_active:
                    self.client.publish(MQTT_TOPIC_ALERT, "OFF")
                    self.is_alarm_active = False
            except:
                pass

        self.frame_buffer.append(annotated)
        self.handle_recording(annotated, frame_has_active_threat)

        return annotated, self.total_alerts, self.event_log

    def get_stats(self):
        return {
            "total_alerts": self.total_alerts,
            "logs": self.event_log,
            "active_threats": len([t for t in self.last_threats])
        }

    # Helper methods
    @staticmethod
    def _center(bbox):
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    @staticmethod
    def _dist(ax, ay, bx, by):
        return math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)

    def _relink_by_reid(self, camera_id, target_global_id, persons):
        """Find person with matching global ID"""
        if self.reid_model is None:
            return None
        for pid in persons:
            gid = self.reid_model.get_global_id(camera_id, pid)
            if gid == target_global_id:
                return pid
        return None

    def _person_colour(self, camera_id, track_id):
        if self.reid_model is not None:
            return self.reid_model.get_color_for_track(camera_id, track_id)
        return self._COLOUR_PERSON

    @staticmethod
    def _put_label(frame, text, pos, colour):
        x, y = pos
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
        cv2.rectangle(frame, (x, y - th - 6), (x + tw + 2, y), colour, -1)
        cv2.putText(frame, text, (x, y - 4), cv2.FONT_HERSHEY_SIMPLEX,
                   0.5, (255, 255, 255), 1)

    def handle_recording(self, frame, trigger_active):
        """Video recording logic"""
        current_time = time.time()

        if trigger_active and not self.is_recording:
            self.is_recording = True
            self.recording_start_time = current_time

            timestamp = time.strftime("%Y%m%d_%H%M%S")
            self.current_filename = f"weapon_evidence_{timestamp}.mp4"
            self.temp_filepath = os.path.join(self.output_dir, f"temp_{self.current_filename}")
            self.final_filepath = os.path.join(self.output_dir, self.current_filename)

            height, width = frame.shape[:2]
            self.video_writer = None
            codecs_to_try = [self.working_codec] if self.working_codec else self.video_codecs

            for codec in codecs_to_try:
                if codec is None:
                    continue
                try:
                    fourcc = cv2.VideoWriter_fourcc(*codec)
                    writer = cv2.VideoWriter(
                        self.temp_filepath, fourcc, float(self.fps_estimate), (width, height)
                    )
                    if writer.isOpened():
                        self.video_writer = writer
                        self.working_codec = codec
                        break
                    else:
                        writer.release()
                except:
                    pass

            if not self.video_writer or not self.video_writer.isOpened():
                self.is_recording = False
                return

            for past_frame in self.frame_buffer:
                self.video_writer.write(past_frame)

        if self.is_recording:
            if self.video_writer:
                self.video_writer.write(frame)

            if (current_time - self.recording_start_time) > self.post_event_seconds:
                self.stop_recording()

    def stop_recording(self):
        """Stop and process video"""
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None

            try:
                command = ['ffmpeg', '-y', '-i', self.temp_filepath,
                          '-c', 'copy', '-movflags', '+faststart',
                          self.final_filepath]
                subprocess.run(command, check=True,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                if os.path.exists(self.temp_filepath):
                    os.remove(self.temp_filepath)

                if APP_ENV == "prod":
                    upload_thread = threading.Thread(
                        target=self.upload_to_gcp,
                        args=(self.final_filepath, self.current_filename)
                    )
                    upload_thread.start()
            except Exception as e:
                if os.path.exists(self.temp_filepath):
                    os.rename(self.temp_filepath, self.final_filepath)

    def upload_to_gcp(self, file_path, file_name):
        """Upload to GCP"""
        if not self.storage_client:
            return
        try:
            bucket = self.storage_client.bucket(GCP_BUCKET_NAME)
            blob = bucket.blob(file_name)
            blob.upload_from_filename(file_path)
        except Exception as e:
            print(f"❌ Upload Failed: {e}")

    def acknowledge_alert(self, weapon_id_str):
        """Acknowledge an alert"""
        try:
            weapon_id = int(weapon_id_str)
        except:
            weapon_id = weapon_id_str

        self.acknowledged_detections[weapon_id] = time.time() + 300

        for event in self.event_log:
            if event.get('weapon_track') == weapon_id:
                event['active'] = False

        if self.mqtt_connected:
            try:
                stats = self.get_stats()
                self.client.publish(MQTT_TOPIC_STATUS, json.dumps(stats))
            except:
                pass
