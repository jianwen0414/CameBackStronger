from ultralytics import YOLO
from edge.tracker.tracker import Tracker
import numpy as np
import time
import math
import cv2
import os
import json
from datetime import datetime
import paho.mqtt.client as mqtt
from collections import deque, defaultdict
import subprocess
from dotenv import load_dotenv
from enum import Enum, auto

import threading # For non-blocking uploads to GCP
from google.cloud import storage

load_dotenv()

# --- CONFIGURATION ---
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
MQTT_TOPIC_STATUS = os.getenv("MQTT_TOPIC_STATUS", "cam-01/status")
MQTT_TOPIC_ALERT = os.getenv("MQTT_TOPIC_ALERT", "cam-01/alert")
MQTT_TOPIC_ACK = os.getenv("MQTT_TOPIC_ACK", "cam-01/ack")

APP_ENV = os.getenv("APP_ENV", "dev")  # Options: 'dev', 'prod'
GCP_BUCKET_NAME = os.getenv("GCP_BUCKET_NAME", "evidence-clips")

class LuggageDetector:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_dir, 'models', 'yolo11s.pt')

        self.model = YOLO(model_path)
        self.person_tracker = Tracker()
        self.bag_tracker = Tracker()
        
        # State
        self.bag_to_person = {}
        self.bag_timers = {}
        self.event_log = [] # RAM Only
        self.total_alerts = 0
        self.bag_indexes = [24, 26, 28] 
        self.distance_threshold = 150
        self.time_limit = 5.0
        self.acknowledged_bags = {} 
        
        # MQTT
        self.client = mqtt.Client()
        self.is_alarm_active = False 
        self.client.on_message = self.on_mqtt_message
        
        try:
            self.client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT)
            self.client.subscribe(MQTT_TOPIC_ACK)
            self.client.loop_start()
            print(f">>> MQTT Connected. Listening for Acks on {MQTT_TOPIC_ACK}")
        except Exception as e:
            print(f"MQTT Connection Failed: {e}")

        # Video Recording
        self.is_recording = False
        self.video_writer = None
        self.recording_start_time = 0
        self.fps_estimate = 20  
        self.pre_event_seconds = 30
        self.post_event_seconds = 30
        
        buffer_size = self.fps_estimate * self.pre_event_seconds
        self.frame_buffer = deque(maxlen=buffer_size)

        self.output_dir = "evidence"
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

        # --- Initialize Cloud Client (Lazy load if needed, but here is fine) ---
        self.storage_client = None
        if APP_ENV == "prod":
            try:
                self.storage_client = storage.Client()
                print(f">>> ☁️  GCP Storage Initialized. Target Bucket: {GCP_BUCKET_NAME}")
            except Exception as e:
                print(f"❌ GCP Init Failed: {e}")

    def on_mqtt_message(self, client, userdata, msg):
        try:
            if msg.topic == MQTT_TOPIC_ACK:
                bag_id = int(msg.payload.decode())
                print(f"📡 Remote Command: Silence Bag {bag_id}")
                self.acknowledge_alert(bag_id)
        except Exception as e:
            print(f"❌ Error processing Ack: {e}")
            
    def get_stats(self):
        p_tracks = self.person_tracker.tracks if self.person_tracker.tracks is not None else []
        b_tracks = self.bag_tracker.tracks if self.bag_tracker.tracks is not None else []
        current_time = time.time()
        real_threats = 0
        
        current_bag_ids = [b.track_id for b in b_tracks]
        
        for bid, start_time in self.bag_timers.items():
            if bid in current_bag_ids:
                elapsed = current_time - start_time
                if elapsed > self.time_limit:
                    if bid not in self.acknowledged_bags:
                        real_threats += 1

        return {
            "total_alerts": self.total_alerts,
            "logs": self.event_log,
            "person_count": len(p_tracks),
            "bag_count": len(b_tracks),
            "active_threats": real_threats
        }

    def calculate_distance(self, box1, box2):
        x1 = (box1[0] + box1[2]) / 2
        y1 = (box1[1] + box1[3]) / 2
        x2 = (box2[0] + box2[2]) / 2
        y2 = (box2[1] + box2[3]) / 2
        return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    def draw_visuals(self, frame, annotations):
        for ann in annotations:
            x1, y1, x2, y2 = ann['bbox']
            cv2.rectangle(frame, (x1, y1), (x2, y2), ann['color'], 2)
            cv2.putText(frame, ann['label'], (x1, y1 - 2), 0, 0.6, (255, 255, 255), 2)
        return frame

    def process_frame(self, frame):
        display_frame = frame.copy() 
        current_time = time.time()
        
        results = self.model(frame, verbose=False)
        det_bag = []
        det_person = []

        for result in results:
            for box in result.boxes.data.tolist():
                # --- BUG FIX HERE: Added list() around map() ---
                x1, y1, x2, y2, conf, cls = list(map(int, box[:4])) + [box[4], int(box[5])]
                
                if cls in self.bag_indexes: det_bag.append([x1, y1, x2, y2, conf])
                elif cls == 0: det_person.append([x1, y1, x2, y2, conf])

        self.person_tracker.update(frame, np.array(det_person) if det_person else np.empty((0, 5)))
        self.bag_tracker.update(frame, det_bag)

        # Cleanup Ghost Timers
        current_bag_ids = [b.track_id for b in self.bag_tracker.tracks]
        expired_timers = [bid for bid in self.bag_timers if bid not in current_bag_ids]
        for bid in expired_timers: del self.bag_timers[bid]

        current_persons = {p.track_id: p.bbox for p in self.person_tracker.tracks}
        annotations = []
        frame_has_active_threat = False

        for pid, bbox in current_persons.items():
            annotations.append({'bbox': list(map(int, bbox)), 'label': f"P{pid}", 'color': (255, 0, 0)})

        for bag in self.bag_tracker.tracks:
            bid = bag.track_id
            assigned_id = self.bag_to_person.get(bid)
            is_violation = True
            
            if assigned_id and assigned_id in current_persons:
                if self.calculate_distance(bag.bbox, current_persons[assigned_id]) <= self.distance_threshold:
                    is_violation = False

            if is_violation:
                min_dist = float('inf')
                best_p = None
                for pid, pbbox in current_persons.items():
                    d = self.calculate_distance(bag.bbox, pbbox)
                    if d < min_dist: min_dist, best_p = d, pid
                if best_p and min_dist < self.distance_threshold:
                    self.bag_to_person[bid] = best_p
                    is_violation = False

            bag_status = "SAFE"
            
            # Check Snooze Expiry
            if bid in self.acknowledged_bags and current_time > self.acknowledged_bags[bid]:
                del self.acknowledged_bags[bid]
            
            if is_violation:
                if bid not in self.bag_timers: self.bag_timers[bid] = current_time
                elapsed = current_time - self.bag_timers[bid]
                
                if elapsed > self.time_limit:
                    if bid in self.acknowledged_bags:
                        bag_status = "SNOOZED"
                        rem = int(self.acknowledged_bags[bid] - current_time)
                        label = f"Snoozed {rem//60}:{rem%60:02d}"
                        color = (0, 165, 255)
                    else:
                        bag_status = "UNATTENDED"
                        frame_has_active_threat = True
                        label = f"ALERT! {int(elapsed - self.time_limit)}s"
                        color = (0, 0, 255)
                        
                        # Add to RAM Log
                        active_logs = [l['id'] for l in self.event_log if l.get('active')]
                        if bid not in active_logs:
                            new_event = {
                                "id": bid,
                                "date": datetime.now().strftime("%Y-%m-%d"),
                                "time": datetime.now().strftime("%H:%M:%S"),
                                "venue": "Main Lobby",
                                "type": "ALERT", "active": True
                            }
                            self.event_log.insert(0, new_event)
                            self.total_alerts += 1
                else:
                    bag_status = "WARNING"
                    label = f"Warn {int(self.time_limit - elapsed)}"
                    color = (0, 255, 255)
            else:
                if bid in self.bag_timers: del self.bag_timers[bid]
                bag_status = "SAFE"
                label = f"Bag {bid}"
                color = (0, 255, 0)

            annotations.append({'bbox': list(map(int, bag.bbox)), 'label': label, 'color': color})

        self.acknowledged_bags = {bid: v for bid, v in self.acknowledged_bags.items() if bid in current_bag_ids}

        # MQTT PUBLISH
        stats = self.get_stats()
        self.client.publish(MQTT_TOPIC_STATUS, json.dumps(stats))

        if frame_has_active_threat and not self.is_alarm_active:
            self.client.publish(MQTT_TOPIC_ALERT, "ON")
            self.is_alarm_active = True
        elif not frame_has_active_threat and self.is_alarm_active:
            self.client.publish(MQTT_TOPIC_ALERT, "OFF")
            self.is_alarm_active = False

        display_frame = self.draw_visuals(display_frame, annotations)
        self.frame_buffer.append(display_frame)
        self.handle_recording(display_frame, frame_has_active_threat)

        return display_frame, self.total_alerts, self.event_log

    def handle_recording(self, frame, trigger_active):
        current_time = time.time()

        if trigger_active and not self.is_recording:
            print(">>> THREAT DETECTED: SAVING EVIDENCE (Pre-Event + Post-Event)")
            self.is_recording = True
            self.recording_start_time = current_time
            
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            self.current_filename = f"evidence_{timestamp}.mp4"
            self.temp_filepath = os.path.join(self.output_dir, f"temp_{self.current_filename}")
            self.final_filepath = os.path.join(self.output_dir, self.current_filename)
            
            height, width = frame.shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*'avc1') 
            
            self.video_writer = cv2.VideoWriter(self.temp_filepath, fourcc, float(self.fps_estimate), (width, height))
            
            for past_frame in self.frame_buffer:
                self.video_writer.write(past_frame)
            
            print(f">>> Dumped {len(self.frame_buffer)} pre-event frames to disk.")

        if self.is_recording:
            if self.video_writer:
                self.video_writer.write(frame)
            
            if (current_time - self.recording_start_time) > self.post_event_seconds:
                print(">>> RECORDING COMPLETE")
                self.stop_recording()

    def stop_recording(self):
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
            
            print(">>> Processing video for web playback...")
            try:
                command = [
                    'ffmpeg', '-y',           
                    '-i', self.temp_filepath, 
                    '-c', 'copy',             
                    '-movflags', '+faststart',
                    self.final_filepath       
                ]
                subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                if os.path.exists(self.temp_filepath):
                    os.remove(self.temp_filepath)
                    
                print(f">>> Video processed and saved: {self.final_filepath}")

                # --- Trigger Cloud Upload Logic ---
                if APP_ENV == "prod":
                    # Use a thread so we don't block the video feed loop!
                    upload_thread = threading.Thread(
                        target=self.upload_to_gcp, 
                        args=(self.final_filepath, self.current_filename)
                    )
                    upload_thread.start()
            except Exception as e:
                print(f"FFmpeg Error: {e}")
                if os.path.exists(self.temp_filepath):
                    os.rename(self.temp_filepath, self.final_filepath)

    def upload_to_gcp(self, file_path, file_name):
        """
        Worker function to upload the file to GCP Cloud Storage.
        Runs in a background thread.
        """
        if not self.storage_client:
            print("❌ Cloud Storage client not initialized.")
            return

        try:
            print(f"☁️  Started Uploading {file_name} to GCP...")
            bucket = self.storage_client.bucket(GCP_BUCKET_NAME)
            blob = bucket.blob(file_name)
            
            # This takes time, which is why we are in a thread
            blob.upload_from_filename(file_path)
            
            print(f"✅ Upload Complete: gs://{GCP_BUCKET_NAME}/{file_name}")
            
            # Optional: Delete local file after successful upload to save space
            # os.remove(file_path) 
            
        except Exception as e:
            print(f"❌ Upload Failed: {e}")

    def acknowledge_alert(self, bag_id):
        print(f">>> Processing ACK for Bag {bag_id}")
        self.acknowledged_bags[bag_id] = time.time() + 300
        
        for event in self.event_log:
            if event['id'] == bag_id:
                event['active'] = False
        
        stats = self.get_stats()
        self.client.publish(MQTT_TOPIC_STATUS, json.dumps(stats))


# =============================================================================
# WeaponDetector
# =============================================================================

# YOLO class indices (matches your bestv3.pt labels)
CLS_GUN    = 0
CLS_KNIFE  = 1
CLS_PERSON = 2

WEAPON_CLASSES = {CLS_GUN, CLS_KNIFE}
WEAPON_LABELS  = {CLS_GUN: "Gun", CLS_KNIFE: "Knife"}


class WeaponOwnership(Enum):
    """State machine for each tracked weapon."""
    UNOWNED        = auto()   # No confirmed holder yet
    CONFIRMING     = auto()   # Candidate person found; waiting N frames
    OWNED          = auto()   # Locked to a specific person track
    LOCKED_ORPHAN  = auto()   # Holder left frame; weapon remembers reid global_id


class WeaponState:
    """
    Per-weapon tracking state.

    Attributes
    ----------
    weapon_id       : ByteTrack ID of the weapon
    weapon_cls      : CLS_GUN or CLS_KNIFE
    status          : WeaponOwnership enum value
    owner_track_id  : ByteTrack track_id of the confirmed holder (or None)
    owner_global_id : ReID global person ID of the confirmed holder (or -1)
                      Used to re-link if the person re-enters frame.
    confirm_frames  : Counter of consecutive frames within threshold
    orphan_frames   : Frames elapsed since holder left (for timeout)
    """

    def __init__(self, weapon_id: int, weapon_cls: int) -> None:
        self.weapon_id: int            = weapon_id
        self.weapon_cls: int           = weapon_cls
        self.status: WeaponOwnership   = WeaponOwnership.UNOWNED
        self.owner_track_id: int | None = None
        self.owner_global_id: int      = -1
        self.candidate_track_id: int | None = None
        self.confirm_frames: int       = 0
        self.orphan_frames: int        = 0


class WeaponDetector:
    """
    Detect weapons (gun / knife) and associate them with persons.

    Association rules
    -----------------
    1.  **Distance gate**: a weapon is only considered "near" a person when
        the Euclidean distance between their bounding-box centres is ≤
        ``distance_threshold`` pixels (default 80 px at 640×480).

    2.  **Confirmation window**: the same person must be the nearest candidate
        for ``confirm_frames`` consecutive frames (default 5) before ownership
        is LOCKED.  This prevents a person walking past a dropped weapon from
        accidentally taking ownership.

    3.  **Ownership lock**: once OWNED, no other person can claim the weapon.
        The original owner is remembered by both ByteTrack ID *and* ReID
        global ID so re-identification across cameras works.

    4.  **Orphan timeout**: if the confirmed holder leaves the frame while
        the weapon remains visible, the weapon enters LOCKED_ORPHAN status.
        During this period it cannot be claimed by anyone else.  After
        ``orphan_timeout_frames`` frames (default 150 ≈ 5 s at 30 fps) it
        reverts to UNOWNED, allowing reassignment only then.

    5.  **Weapon disappears**: if the weapon track is lost for any reason the
        entry is removed.  Re-detection creates a fresh UNOWNED weapon.

    Usage
    -----
    ::
        wd = WeaponDetector(reid_model=reid)   # reid_model is optional
        annotated, threats = wd.process_frame(frame, yolo_model, camera_id=1)
    """

    # Colours (BGR) for drawing
    _COLOUR_WEAPON     = (0,   0,   255)   # red   — weapon bbox
    _COLOUR_OWNED      = (0,   255,  0)    # green — confirmed association line
    _COLOUR_CONFIRMING = (0,   165, 255)   # orange — building up confirmation
    _COLOUR_ORPHAN     = (128,  0,  128)   # purple — orphaned weapon
    _COLOUR_PERSON     = (255,  0,   0)    # blue  — person bbox

    def __init__(
        self,
        distance_threshold: int   = 80,
        confirm_frames: int       = 5,
        orphan_timeout_frames: int = 150,
        reid_model=None,           # Optional PersonReID instance
        reid_every_n_frames: int  = 5,
    ) -> None:
        self.distance_threshold    = distance_threshold
        self.confirm_frames_needed = confirm_frames
        self.orphan_timeout_frames = orphan_timeout_frames
        self.reid_model            = reid_model
        self.reid_every_n_frames   = reid_every_n_frames

        # {weapon_track_id: WeaponState}
        self._weapon_states: dict[int, WeaponState] = {}

        self._frame_count: int = 0

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------
    def process_frame(
        self,
        frame: np.ndarray,
        yolo_model,                 # Ultralytics YOLO instance
        camera_id: int = 0,
        detection_conf: float = 0.35,
    ) -> tuple[np.ndarray, list[dict]]:
        """
        Run YOLO + ByteTrack on *frame*, update weapon states, draw
        annotations.

        Returns
        -------
        annotated_frame : np.ndarray
        threats         : list of dicts, one per armed person::
            {
              "camera_id":   int,
              "person_track": int,
              "weapon_track": int,
              "weapon_type":  str,   # "Gun" or "Knife"
              "confidence":   float,
              "bbox_person":  (x1,y1,x2,y2),
              "bbox_weapon":  (x1,y1,x2,y2),
            }
        """
        self._frame_count += 1
        annotated = frame.copy()
        threats: list[dict] = []

        # ── 1. Run YOLO with ByteTrack ────────────────────────────────
        results = yolo_model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=list(WEAPON_CLASSES) + [CLS_PERSON],
            conf=detection_conf,
            verbose=False,
        )

        persons: dict[int, dict]  = {}   # {track_id: {bbox, conf}}
        weapons: dict[int, dict]  = {}   # {track_id: {bbox, conf, cls}}

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes      = results[0].boxes.xyxy.cpu().numpy()
            track_ids  = results[0].boxes.id.cpu().numpy().astype(int)
            confs      = results[0].boxes.conf.cpu().numpy()
            classes    = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, conf, cls in zip(boxes, track_ids, confs, classes):
                x1, y1, x2, y2 = map(int, box)
                entry = {"bbox": (x1, y1, x2, y2), "conf": float(conf)}
                if cls == CLS_PERSON:
                    persons[tid] = entry
                    # ReID is NOT extracted here for everyone.
                    # Only confirmed weapon holders get ReID (see Step 2 below).
                elif cls in WEAPON_CLASSES:
                    entry["cls"] = cls
                    weapons[tid] = entry

        # ── 2. ReID: extract features for confirmed holders AND candidates ──
        if self.reid_model is not None:
            # Confirmed OWNED holders
            confirmed_holders = {
                state.owner_track_id
                for state in self._weapon_states.values()
                if state.status == WeaponOwnership.OWNED
                and state.owner_track_id is not None
            }

            # Candidates currently building up confirmation (UNOWNED with a candidate)
            # Extract their features NOW so by the time they reach OWNED,
            # ReID already has appearance history ready for future relinks.
            candidate_holders = {
                state.candidate_track_id
                for state in self._weapon_states.values()
                if state.status == WeaponOwnership.UNOWNED
                and state.candidate_track_id is not None
            }

            reid_targets = confirmed_holders | candidate_holders

            if reid_targets and self._frame_count % self.reid_every_n_frames == 0:
                for pid in reid_targets:
                    if pid in persons:
                        x1, y1, x2, y2 = persons[pid]["bbox"]
                        crop = frame[y1:y2, x1:x2]
                        feats = self.reid_model.extract_features(crop)
                        self.reid_model.update_features(camera_id, pid, feats)

            # Run matching whenever camera_features has data (not just confirmed holders)
            if self.reid_model.camera_features:
                matches = self.reid_model.find_cross_camera_matches(threshold=0.70)
                self.reid_model.assign_global_ids(matches)

        # ── 3. Prune weapon states for lost weapons ───────────────────
        active_weapon_ids = set(weapons.keys())
        lost = [wid for wid in self._weapon_states if wid not in active_weapon_ids]
        for wid in lost:
            del self._weapon_states[wid]

        # ── 4. Update state machine for each visible weapon ───────────
        for wid, winfo in weapons.items():
            if wid not in self._weapon_states:
                self._weapon_states[wid] = WeaponState(wid, winfo["cls"])

            state = self._weapon_states[wid]
            wx, wy = self._center(winfo["bbox"])

            # ── Find nearest person within threshold ──────────────
            nearest_pid: int | None = None
            nearest_dist: float = float("inf")
            for pid, pinfo in persons.items():
                d = self._dist(wx, wy, *self._center(pinfo["bbox"]))
                if d < self.distance_threshold and d < nearest_dist:
                    nearest_dist = d
                    nearest_pid  = pid

            # ── Resolve ReID global ID for confirmed owner ────────
            owner_global_id = -1
            if state.owner_track_id is not None and self.reid_model is not None:
                owner_global_id = self.reid_model.get_global_id(
                    camera_id, state.owner_track_id
                )

            # ── State transitions ─────────────────────────────────
            if state.status == WeaponOwnership.UNOWNED:
                if nearest_pid is not None:
                    if state.candidate_track_id == nearest_pid:
                        state.confirm_frames += 1
                    else:
                        # New candidate — reset counter
                        state.candidate_track_id = nearest_pid
                        state.confirm_frames = 1

                    if state.confirm_frames >= self.confirm_frames_needed:
                        # Lock ownership
                        state.status         = WeaponOwnership.OWNED
                        state.owner_track_id = nearest_pid
                        if self.reid_model is not None:
                            state.owner_global_id = self.reid_model.get_global_id(
                                camera_id, nearest_pid
                            )
                        state.confirm_frames = 0
                        state.candidate_track_id = None
                else:
                    # Nobody nearby — reset confirmation
                    state.candidate_track_id = None
                    state.confirm_frames = 0

            elif state.status == WeaponOwnership.CONFIRMING:
                # (Kept for future use; transitions happen in UNOWNED above)
                pass

            elif state.status == WeaponOwnership.OWNED:
                owner_in_frame = state.owner_track_id in persons

                if not owner_in_frame:
                    # Try ReID re-link before declaring orphan
                    if self.reid_model is not None and state.owner_global_id >= 0:
                        relinked = self._relink_by_reid(
                            camera_id, state.owner_global_id, persons
                        )
                        if relinked is not None:
                            state.owner_track_id = relinked
                            owner_in_frame = True

                if not owner_in_frame:
                    # Owner definitely gone — enter orphan state
                    state.status       = WeaponOwnership.LOCKED_ORPHAN
                    state.orphan_frames = 0
                # else: owner still present — stay OWNED (no action needed)

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                state.orphan_frames += 1

                # Try to re-link owner via ReID
                if self.reid_model is not None and state.owner_global_id >= 0:
                    relinked = self._relink_by_reid(
                        camera_id, state.owner_global_id, persons
                    )
                    if relinked is not None:
                        state.owner_track_id = relinked
                        state.status         = WeaponOwnership.OWNED
                        state.orphan_frames  = 0
                        continue

                # Timeout — release ownership
                if state.orphan_frames >= self.orphan_timeout_frames:
                    state.status          = WeaponOwnership.UNOWNED
                    state.owner_track_id  = None
                    state.owner_global_id = -1
                    state.orphan_frames   = 0

        # ── 5. Draw annotations & collect threats ─────────────────────
        # Draw persons
        for pid, pinfo in persons.items():
            x1, y1, x2, y2 = pinfo["bbox"]
            colour = self._person_colour(camera_id, pid)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)
            gid = (
                self.reid_model.get_global_id(camera_id, pid)
                if self.reid_model else -1
            )
            label = f"P{pid}" if gid < 0 else f"P{pid} [G{gid}]"
            self._put_label(annotated, label, (x1, y1), colour)

        # Draw weapons + association lines
        for wid, winfo in weapons.items():
            state  = self._weapon_states[wid]
            wx1, wy1, wx2, wy2 = winfo["bbox"]
            wcx, wcy = self._center(winfo["bbox"])
            wlabel = WEAPON_LABELS.get(winfo["cls"], "Weapon")

            if state.status == WeaponOwnership.OWNED and state.owner_track_id in persons:
                # Confirmed + owner visible
                pinfo = persons[state.owner_track_id]
                pcx, pcy = self._center(pinfo["bbox"])
                gid = state.owner_global_id
                gid_tag = f" [G{gid}]" if gid >= 0 else ""

                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_OWNED, 3)
                cv2.line(
                    annotated,
                    (int(wcx), int(wcy)),
                    (int(pcx), int(pcy)),
                    self._COLOUR_OWNED, 2,
                )
                self._put_label(
                    annotated,
                    f"⚠ {wlabel}{gid_tag}",
                    (wx1, wy1),
                    self._COLOUR_OWNED,
                )

                # Record threat
                threats.append({
                    "camera_id":    camera_id,
                    "person_track": state.owner_track_id,
                    "weapon_track": wid,
                    "weapon_type":  wlabel,
                    "confidence":   winfo["conf"],
                    "bbox_person":  pinfo["bbox"],
                    "bbox_weapon":  winfo["bbox"],
                })

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                # Owner gone but weapon still locked
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_ORPHAN, 3)
                remaining = self.orphan_timeout_frames - state.orphan_frames
                self._put_label(
                    annotated,
                    f"⚠ {wlabel} [ORPHAN {remaining}f]",
                    (wx1, wy1),
                    self._COLOUR_ORPHAN,
                )

            elif state.status == WeaponOwnership.UNOWNED and state.candidate_track_id:
                # Building up confirmation
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_CONFIRMING, 2)
                progress = state.confirm_frames
                needed   = self.confirm_frames_needed
                self._put_label(
                    annotated,
                    f"{wlabel} [{progress}/{needed}]",
                    (wx1, wy1),
                    self._COLOUR_CONFIRMING,
                )

            else:
                # Unowned, no candidate
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._COLOUR_WEAPON, 2)
                self._put_label(annotated, wlabel, (wx1, wy1), self._COLOUR_WEAPON)

        return annotated, threats

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _center(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    @staticmethod
    def _dist(ax: float, ay: float, bx: float, by: float) -> float:
        return math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)

    def _relink_by_reid(
        self,
        camera_id: int,
        target_global_id: int,
        persons: dict[int, dict],
    ) -> int | None:
        """
        Scan current persons and return the track_id whose ReID global ID
        matches ``target_global_id``, or None if not found.
        """
        if self.reid_model is None:
            return None
        for pid in persons:
            gid = self.reid_model.get_global_id(camera_id, pid)
            if gid == target_global_id:
                return pid
        return None

    def _person_colour(
        self, camera_id: int, track_id: int
    ) -> tuple[int, int, int]:
        if self.reid_model is not None:
            return self.reid_model.get_color_for_track(camera_id, track_id)
        return self._COLOUR_PERSON

    @staticmethod
    def _put_label(
        frame: np.ndarray,
        text: str,
        pos: tuple[int, int],
        colour: tuple[int, int, int],
    ) -> None:
        x, y = pos
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (x, y - th - 6), (x + tw + 2, y), colour, -1)
        cv2.putText(
            frame, text, (x, y - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2,
        )