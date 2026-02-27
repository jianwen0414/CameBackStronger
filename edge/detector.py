"""
Detector — weapon detection with ByteTrack + optional PersonReID.

Uses a custom-trained YOLO model (bestv4.onnx / bestv4.pt) with 3 classes:
  0 = Gun
  1 = Knife
  2 = Person

Weapon is a threat when OWNED by a confirmed person holder.

Integrates with:
  tracker/bytetrack.yaml  — ByteTrack configuration
  reidentification.py     — optional cross-camera person ReID (torchvision backend)
"""

from ultralytics import YOLO
import numpy as np
import time
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


class _NumpyEncoder(json.JSONEncoder):
    """Handle numpy int/float types that stdlib json cannot serialize."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

from tracker.tracker import _iou
from reidentification import PersonReID, REID_AVAILABLE
from vector_store import SupabaseVectorStore

load_dotenv()

# ── MQTT ──────────────────────────────────────────────────────────────────────
MQTT_BROKER_HOST  = os.getenv("MQTT_BROKER_HOST",  "127.0.0.1")
MQTT_BROKER_PORT  = int(os.getenv("MQTT_BROKER_PORT", 1883))
MQTT_TOPIC_STATUS    = os.getenv("MQTT_TOPIC_STATUS",    "cam-01/status")
MQTT_TOPIC_ALERT     = os.getenv("MQTT_TOPIC_ALERT",     "cam-01/alert")
MQTT_TOPIC_ACK       = os.getenv("MQTT_TOPIC_ACK",       "cam-01/ack")
MQTT_TOPIC_ANALYTICS = os.getenv("MQTT_TOPIC_ANALYTICS", "cam-01/analytics")

APP_ENV         = os.getenv("APP_ENV", "dev")
GCP_BUCKET_NAME = os.getenv("GCP_BUCKET_NAME", "evidence-clips")

# ── Model class indices ────────────────────────────────────────────────────────
CLS_GUN    = 0
CLS_KNIFE  = 1
CLS_PERSON = 2

WEAPON_CLASSES = {CLS_GUN, CLS_KNIFE}
WEAPON_LABELS  = {CLS_GUN: "Gun", CLS_KNIFE: "Knife"}

# ── Per-class confidence thresholds ───────────────────────────────────────────
# YOLO track() only accepts a single conf — we pass the minimum so all
# detections reach the parser, then filter per class here.
CLASS_CONF: dict[int, float] = {
    CLS_GUN:    0.50,
    CLS_KNIFE:  0.30,
    CLS_PERSON: 0.60,
}


# ── State machine ──────────────────────────────────────────────────────────────
class WeaponOwnership(Enum):
    UNOWNED       = auto()
    OWNED         = auto()
    LOCKED_ORPHAN = auto()


class WeaponState:
    """Per-weapon tracking state with ownership."""
    def __init__(self, weapon_id: int, weapon_cls: int) -> None:
        self.weapon_id           = weapon_id
        self.weapon_cls          = weapon_cls
        self.status              = WeaponOwnership.UNOWNED
        self.owner_track_id:  int | None = None
        self.owner_global_id: int        = -1
        self.candidate_track_id: int | None = None
        self.confirm_frames:  int        = 0
        self.orphan_frames:   int        = 0
        # Grace counter: consecutive processed frames with no person overlap.
        # Allows brief IoU gaps without resetting confirm_frames.
        self.no_overlap_frames: int      = 0
        # Grace counter: consecutive processed frames the weapon itself was
        # not detected.  Prevents a single YOLO miss from pruning state.
        self.missed_frames:   int        = 0


# ── Detector ───────────────────────────────────────────────────────────────────
class Detector:
    """
    Weapon detector with PersonReID and ByteTrack integration.

    Weapon logic: OWNED (person confirmed holding it) → alert.
    """

    # Annotation colours (BGR)
    _C_WEAPON    = (0,   0, 255)   # red    — unowned / active alert
    _C_OWNED     = (0, 255,   0)   # green  — confirmed owner association line
    _C_CONFIRM   = (0, 165, 255)   # orange — building confirmation
    _C_ORPHAN    = (128,  0, 128)  # purple — orphaned weapon
    _C_PERSON    = (255,  0,   0)  # blue   — person (no ReID)

    def __init__(
        self,
        camera_id:             int   = 0,
        frame_skip:            int   = 2,
        use_reid:              bool  = False,
        reid_device:           str   = "cpu",
        reid_model:            "PersonReID | None" = None,
        iou_threshold:         float = 0.01,
        confirm_frames:        int   = 5,
        orphan_timeout_frames: int   = 150,
        imgsz:                 int   = 416,
        class_conf:            dict[int, float] | None = None,
    ) -> None:
        # ── Model ────────────────────────────────────────────────────────────
        base_dir  = os.path.dirname(os.path.abspath(__file__))
        onnx_path = os.path.join(base_dir, "model", "best.onnx")
        pt_path   = os.path.join(base_dir, "model", "best.pt")

        if os.path.exists(onnx_path):
            model_path = onnx_path
            print(f">>> Loading ONNX model: {onnx_path}")
        elif os.path.exists(pt_path):
            model_path = pt_path
            print(f">>> Loading PT model: {pt_path}")
        else:
            raise FileNotFoundError(
                f"No model found. Expected:\n  {onnx_path}\n  {pt_path}"
            )

        self.yolo_model = YOLO(model_path)
        print(f">>> Model loaded: {model_path}")

        # ── Config ───────────────────────────────────────────────────────────
        self.camera_id             = camera_id
        self.frame_skip            = frame_skip
        self.frame_counter         = 0
        self.imgsz                 = imgsz
        self.iou_threshold         = iou_threshold
        self.confirm_frames_needed = confirm_frames
        self.orphan_timeout_frames = orphan_timeout_frames
        self.class_conf            = class_conf if class_conf is not None else CLASS_CONF

        # {weapon_track_id: WeaponState}
        self._weapon_states: dict[int, WeaponState] = {}

        # ── ReID ─────────────────────────────────────────────────────────────
        # Priority: injected reid_model > use_reid flag > disabled
        self.reid_every_n_frames = 5
        if reid_model is not None:
            # Shared instance supplied externally (multi-camera setup)
            self.reid_model = reid_model
            print(f">>> PersonReID using shared model (camera {camera_id})")
        elif use_reid and REID_AVAILABLE:
            try:
                self.reid_model = PersonReID(device=reid_device)
                print(">>> PersonReID enabled")
            except Exception as e:
                print(f"⚠️  PersonReID init failed: {e}")
                self.reid_model = None
        else:
            self.reid_model = None
            if use_reid:
                print("⚠️  PersonReID not available (run: uv sync --extra reid)")

        # ── Supabase vector store ─────────────────────────────────────────────
        self.vector_store: SupabaseVectorStore | None = None
        _sb_url = os.getenv("SUPABASE_URL")
        _sb_key = os.getenv("SUPABASE_SERVICE_KEY")
        if _sb_url and _sb_key:
            try:
                self.vector_store = SupabaseVectorStore(_sb_url, _sb_key)
                print(">>> Supabase vector store enabled")
            except Exception as e:
                print(f"⚠️  Supabase vector store init failed: {e}")

        # ── Event log ────────────────────────────────────────────────────────
        self.event_log           = []
        self.total_alerts        = 0
        self.current_person_count = 0
        self.acknowledged_detections: dict[int, float] = {}

        # ── MQTT ─────────────────────────────────────────────────────────────
        self.client          = mqtt.Client()
        self.is_alarm_active = False
        self.mqtt_connected  = False
        self.client.on_message = self.on_mqtt_message

        def on_connect(client, userdata, flags, rc):
            if rc == 0:
                self.mqtt_connected = True
                client.subscribe(MQTT_TOPIC_ACK)
                print(f">>> MQTT Connected (rc={rc})")
            else:
                self.mqtt_connected = False
                print(f"⚠️  MQTT Connect failed (rc={rc})")

        def on_disconnect(client, userdata, rc):
            self.mqtt_connected = False
            print(f"⚠️  MQTT Disconnected (rc={rc}), will auto-reconnect...")

        self.client.on_connect    = on_connect
        self.client.on_disconnect = on_disconnect

        try:
            self.client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT)
            self.client.loop_start()
            print(">>> MQTT Connecting...")
        except Exception as e:
            print(f"⚠️  MQTT Connection Failed: {e}")

        # ── Video recording ──────────────────────────────────────────────────
        self.is_recording         = False
        self.video_writer         = None
        self.recording_start_time = 0
        self.fps_estimate         = 20
        self.pre_event_seconds    = 10
        self.post_event_seconds   = 10
        self.video_codecs  = ["mp4v", "avc1", "H264", "X264", "XVID", "MJPG"]
        self.working_codec = None

        buffer_size       = self.fps_estimate * self.pre_event_seconds
        self.frame_buffer = deque(maxlen=buffer_size)

        self.output_dir = "evidence"
        os.makedirs(self.output_dir, exist_ok=True)

        # ── GCP ──────────────────────────────────────────────────────────────
        self.storage_client = None
        if APP_ENV == "prod":
            try:
                self.storage_client = storage.Client()
                print(f">>> GCP Storage Initialized → {GCP_BUCKET_NAME}")
            except Exception as e:
                print(f"❌ GCP Init Failed: {e}")

        # Frame-skip cache
        self.last_annotated_frame = None
        self.last_threats: list   = []

    # ── MQTT ──────────────────────────────────────────────────────────────────
    def on_mqtt_message(self, client, userdata, msg):
        try:
            if msg.topic == MQTT_TOPIC_ACK:
                self.acknowledge_alert(msg.payload.decode())
        except Exception as e:
            print(f"❌ Error processing Ack: {e}")

    # ── Main loop ─────────────────────────────────────────────────────────────
    def process_frame(self, frame: np.ndarray):
        """
        Run YOLO + ByteTrack, update ownership state machine, draw annotations.
        Returns (annotated_frame, total_alerts, event_log).
        """
        self.frame_counter += 1
        current_time = time.time()

        # Frame skipping
        if self.frame_counter % self.frame_skip != 0:
            if self.last_annotated_frame is not None:
                self.frame_buffer.append(self.last_annotated_frame)
                return self.last_annotated_frame, self.total_alerts, self.event_log
            return frame, self.total_alerts, self.event_log

        # ── 1. YOLO inference ─────────────────────────────────────────────────
        # Pass the minimum class threshold so all detections reach the parser;
        # per-class filtering is applied in step 2.
        _min_conf = min(self.class_conf.values())
        results = self.yolo_model.track(
            frame,
            persist=True,
            tracker="tracker/bytetrack.yaml",
            classes=list(WEAPON_CLASSES) + [CLS_PERSON],
            conf=_min_conf,
            imgsz=self.imgsz,
            verbose=False,
            task="detect"
        )

        # ── 2. Parse tracks (per-class confidence filter) ─────────────────────
        persons: dict[int, dict] = {}
        weapons: dict[int, dict] = {}

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes     = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy().astype(int)
            confs     = results[0].boxes.conf.cpu().numpy()
            classes   = results[0].boxes.cls.cpu().numpy().astype(int)

            for box, tid, conf, cls in zip(boxes, track_ids, confs, classes):
                # Drop detections below this class's individual threshold
                if float(conf) < self.class_conf.get(cls, _min_conf):
                    continue
                x1, y1, x2, y2 = map(int, box)
                entry = {"bbox": (x1, y1, x2, y2), "conf": float(conf)}
                if cls == CLS_PERSON:
                    persons[tid] = entry
                elif cls in WEAPON_CLASSES:
                    entry["cls"] = cls
                    weapons[tid] = entry

        # Track live person count for MQTT analytics
        self.current_person_count = len(persons)

        # ── 3. ReID ───────────────────────────────────────────────────────────
        if self.reid_model is not None and self.frame_counter % self.reid_every_n_frames == 0:
            # Extract features for ALL persons — builds the appearance gallery
            # so re-entrants can be matched even when not holding a weapon.
            for pid, pinfo in persons.items():
                x1, y1, x2, y2 = pinfo["bbox"]
                feats = self.reid_model.extract_features(frame[y1:y2, x1:x2])
                self.reid_model.update_features(self.camera_id, pid, feats)

            # Re-identify returning persons: for each person who has no global
            # ID yet, check if their appearance matches a weapon-holder in the
            # gallery.  Global IDs only exist for confirmed weapon holders, so
            # _find_gallery_match will never match an innocent bystander.
            for pid in persons:
                if self.reid_model.get_global_id(self.camera_id, pid) >= 0:
                    continue  # already identified
                gid = self.reid_model._find_gallery_match(
                    self.camera_id, pid,
                    active_track_ids=set(persons.keys()),
                )
                if gid >= 0:
                    self.reid_model.global_person_ids[(self.camera_id, pid)] = gid
                    continue
                # Not in local gallery — query Supabase in background
                if self.vector_store is not None:
                    avg_feats = self.reid_model.get_averaged_features(self.camera_id, pid)
                    if avg_feats is not None:
                        def _remote_match(pid=pid, feats=avg_feats):
                            remote_gid = self.vector_store.find_similar(feats)
                            if remote_gid is not None:
                                self.reid_model.global_person_ids[(self.camera_id, pid)] = remote_gid
                        threading.Thread(target=_remote_match, daemon=True).start()

        # ── 4. Prune lost weapons ─────────────────────────────────────────────
        # UNOWNED states get a short grace period (5 processed frames) so a
        # brief YOLO miss doesn't reset confirm_frames back to zero.
        # OWNED / LOCKED_ORPHAN states are pruned immediately when the weapon
        # leaves detection entirely (the LOCKED_ORPHAN timer handles the normal
        # "owner left frame" case while weapon is still visible).
        _UNOWNED_GRACE = 5
        to_prune = []
        for wid, state in self._weapon_states.items():
            if wid not in weapons:
                state.missed_frames += 1
                if state.status != WeaponOwnership.UNOWNED or state.missed_frames > _UNOWNED_GRACE:
                    to_prune.append(wid)
            else:
                state.missed_frames = 0
        for wid in to_prune:
            # Clear active log entries so a subsequent pick-up triggers a new alert
            for event in self.event_log:
                if event.get("weapon_track") == wid:
                    event["active"] = False
            del self._weapon_states[wid]

        # ── 5. Ownership state machine ────────────────────────────────────────
        frame_has_active_threat = False
        threats = []

        for wid, winfo in weapons.items():
            if wid not in self._weapon_states:
                self._weapon_states[wid] = WeaponState(wid, winfo["cls"])
            state = self._weapon_states[wid]

            # Find person with highest IoU overlap
            nearest_pid = None
            best_iou    = self.iou_threshold
            for pid, pinfo in persons.items():
                iou = _iou(np.array(winfo["bbox"]), np.array(pinfo["bbox"]))
                if iou > best_iou:
                    best_iou    = iou
                    nearest_pid = pid

            if state.status == WeaponOwnership.UNOWNED:
                if nearest_pid is not None:
                    state.no_overlap_frames = 0
                    # Count ANY person overlapping — don't reset on track ID
                    # change (ByteTrack frequently reassigns IDs with frame_skip).
                    state.confirm_frames += 1
                    state.candidate_track_id = nearest_pid

                    if state.confirm_frames >= self.confirm_frames_needed:
                        state.status         = WeaponOwnership.OWNED
                        state.owner_track_id = nearest_pid
                        state.confirm_frames = 0
                        state.candidate_track_id = None
                        if self.reid_model is not None:
                            gid = self.reid_model.get_global_id(self.camera_id, nearest_pid)

                            if gid < 0 and self.vector_store is not None:
                                # Try persistent store (cross-node / cross-restart)
                                avg_feats = self.reid_model.get_averaged_features(
                                    self.camera_id, nearest_pid
                                )
                                if avg_feats is not None:
                                    gid = self.vector_store.find_similar(avg_feats) or -1

                            if gid < 0:
                                # New person — mint globally unique ID
                                if self.vector_store is not None:
                                    try:
                                        gid = self.vector_store.next_person_id()
                                    except Exception:
                                        gid = self.reid_model._next_global_id
                                        self.reid_model._next_global_id += 1
                                else:
                                    gid = self.reid_model._next_global_id
                                    self.reid_model._next_global_id += 1

                            # Assign to local gallery
                            self.reid_model.global_person_ids[
                                (self.camera_id, nearest_pid)
                            ] = gid
                            state.owner_global_id = gid

                            # Persist embedding (background thread, fire-and-forget)
                            if self.vector_store is not None:
                                avg_feats = self.reid_model.get_averaged_features(
                                    self.camera_id, nearest_pid
                                )
                                if avg_feats is not None:
                                    wlabel = WEAPON_LABELS.get(winfo["cls"], "Weapon")
                                    threading.Thread(
                                        target=self.vector_store.store_embedding,
                                        args=(gid, self.camera_id, avg_feats,
                                              wlabel, winfo["conf"]),
                                        daemon=True,
                                    ).start()
                else:
                    # No person overlaps this frame — allow a brief grace window
                    # (equal to confirm_frames_needed) before resetting progress.
                    state.no_overlap_frames += 1
                    if state.no_overlap_frames > self.confirm_frames_needed:
                        state.candidate_track_id = None
                        state.confirm_frames = 0
                        state.no_overlap_frames = 0

            elif state.status == WeaponOwnership.OWNED:
                owner_in_frame = state.owner_track_id in persons
                if not owner_in_frame and self.reid_model is not None and state.owner_global_id >= 0:
                    relinked = self._relink_by_reid(self.camera_id, state.owner_global_id, persons)
                    if relinked is not None:
                        state.owner_track_id = relinked
                        owner_in_frame = True

                if not owner_in_frame:
                    state.status        = WeaponOwnership.LOCKED_ORPHAN
                    state.orphan_frames = 0

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                state.orphan_frames += 1
                if self.reid_model is not None and state.owner_global_id >= 0:
                    relinked = self._relink_by_reid(self.camera_id, state.owner_global_id, persons)
                    if relinked is not None:
                        state.owner_track_id   = relinked
                        state.status           = WeaponOwnership.OWNED
                        state.orphan_frames    = 0
                        continue

                if state.orphan_frames >= self.orphan_timeout_frames:
                    state.status          = WeaponOwnership.UNOWNED
                    state.owner_track_id  = None
                    state.owner_global_id = -1
                    state.orphan_frames   = 0

            # Expire snooze if timer elapsed
            if wid in self.acknowledged_detections and current_time > self.acknowledged_detections[wid]:
                del self.acknowledged_detections[wid]

            # Threat: weapon actively held
            if (state.status == WeaponOwnership.OWNED
                    and state.owner_track_id in persons
                    and wid not in self.acknowledged_detections):
                frame_has_active_threat = True
                wlabel = WEAPON_LABELS.get(winfo["cls"], "Weapon")
                threats.append({
                    "camera_id":    self.camera_id,
                    "weapon_track": wid,
                    "person_track": state.owner_track_id,
                    "weapon_type":  wlabel,
                    "confidence":   winfo["conf"],
                    "bbox_weapon":  winfo["bbox"],
                    "bbox_person":  persons[state.owner_track_id]["bbox"],
                })
                # Log once per ownership lock
                active_ids = {e["weapon_track"] for e in self.event_log if e.get("active")}
                if wid not in active_ids:
                    self.event_log.insert(0, {
                        "weapon_track": wid,
                        "person_track": state.owner_track_id,
                        "id":           f"{wlabel}_{self.total_alerts}",
                        "date":         datetime.now().strftime("%Y-%m-%d"),
                        "time":         datetime.now().strftime("%H:%M:%S"),
                        "weapon_type":  wlabel,
                        "confidence":   f"{winfo['conf']:.2f}",
                        "type":         "WEAPON_ALERT",
                        "active":       True,
                    })
                    self.total_alerts += 1
                    print(f"🚨 ALERT: {wlabel} (ID:{wid}) held by person {state.owner_track_id}")

        # ── 6. Draw annotations ───────────────────────────────────────────────
        annotated = frame.copy()

        for pid, pinfo in persons.items():
            x1, y1, x2, y2 = pinfo["bbox"]
            colour = self._person_colour(self.camera_id, pid)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)
            gid   = self.reid_model.get_global_id(self.camera_id, pid) if self.reid_model else -1
            label = f"P{pid}" if gid < 0 else f"P{pid}[G{gid}]"
            self._put_label(annotated, label, (x1, y1), colour)

        for wid, winfo in weapons.items():
            state  = self._weapon_states[wid]
            wx1, wy1, wx2, wy2 = winfo["bbox"]
            wcx, wcy = self._center(winfo["bbox"])
            wlabel = WEAPON_LABELS.get(winfo["cls"], "Weapon")
            is_snoozed = wid in self.acknowledged_detections

            if state.status == WeaponOwnership.OWNED and state.owner_track_id in persons:
                pinfo  = persons[state.owner_track_id]
                pcx, pcy = self._center(pinfo["bbox"])
                gid_tag  = f"[G{state.owner_global_id}]" if state.owner_global_id >= 0 else ""

                if is_snoozed:
                    rem = int(self.acknowledged_detections[wid] - time.time())
                    cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._C_CONFIRM, 2)
                    self._put_label(annotated,
                                    f"SNOOZED {wlabel} {rem//60}:{rem%60:02d}",
                                    (wx1, wy1), self._C_CONFIRM)
                else:
                    cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._C_WEAPON, 3)
                    cv2.line(annotated, (int(wcx), int(wcy)), (int(pcx), int(pcy)),
                             self._C_OWNED, 2)
                    self._put_label(annotated, f"!! {wlabel}{gid_tag}",
                                    (wx1, wy1), self._C_WEAPON)

            elif state.status == WeaponOwnership.LOCKED_ORPHAN:
                rem = self.orphan_timeout_frames - state.orphan_frames
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._C_ORPHAN, 3)
                self._put_label(annotated, f"⚠ {wlabel} [ORPHAN {rem}f]",
                                (wx1, wy1), self._C_ORPHAN)

            elif state.status == WeaponOwnership.UNOWNED and state.candidate_track_id:
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._C_CONFIRM, 2)
                self._put_label(annotated,
                                f"{wlabel} [{state.confirm_frames}/{self.confirm_frames_needed}]",
                                (wx1, wy1), self._C_CONFIRM)
            else:
                cv2.rectangle(annotated, (wx1, wy1), (wx2, wy2), self._C_WEAPON, 2)
                self._put_label(annotated, wlabel, (wx1, wy1), self._C_WEAPON)

        # ── 7. Cache + MQTT + recording ───────────────────────────────────────
        self.last_annotated_frame = annotated
        self.last_threats         = threats

        if self.mqtt_connected and self.frame_counter % 10 == 0:
            try:
                self.client.publish(MQTT_TOPIC_STATUS, json.dumps(self.get_stats(), cls=_NumpyEncoder))
                topic_prefix = MQTT_TOPIC_STATUS.rsplit("/", 1)[0]
                analytics_payload = {
                    "camera_id":     int(self.camera_id),
                    "topic_prefix":  topic_prefix,
                    "person_count":  int(self.current_person_count),
                    "alert_count":   int(self.total_alerts),
                    "active_threats": int(len(threats)),
                    "gun_count":     int(sum(1 for w in weapons.values() if w["cls"] == CLS_GUN)),
                    "knife_count":   int(sum(1 for w in weapons.values() if w["cls"] == CLS_KNIFE)),
                    "timestamp":     datetime.now().isoformat(),
                }
                self.client.publish(MQTT_TOPIC_ANALYTICS, json.dumps(analytics_payload, cls=_NumpyEncoder))
                if frame_has_active_threat and not self.is_alarm_active:
                    self.client.publish(MQTT_TOPIC_ALERT, "ON")
                    self.is_alarm_active = True
                elif not frame_has_active_threat and self.is_alarm_active:
                    self.client.publish(MQTT_TOPIC_ALERT, "OFF")
                    self.is_alarm_active = False
            except Exception as e:
                print(f"⚠️  MQTT publish error: {e}")
                self.mqtt_connected = False  # trigger reconnect on next loop

        self.frame_buffer.append(annotated)
        self.handle_recording(annotated, frame_has_active_threat)

        return annotated, self.total_alerts, self.event_log

    # ── Stats ──────────────────────────────────────────────────────────────────
    def get_stats(self) -> dict:
        return {
            "total_alerts":   int(self.total_alerts),
            "logs":           self.event_log,
            "active_threats": int(len(self.last_threats)),
        }

    # ── Helpers ───────────────────────────────────────────────────────────────
    @staticmethod
    def _center(bbox) -> tuple[float, float]:
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    def _relink_by_reid(self, camera_id, target_global_id, persons):
        if self.reid_model is None:
            return None
        for pid in persons:
            if self.reid_model.get_global_id(camera_id, pid) == target_global_id:
                return pid
        return None

    def _person_colour(self, camera_id, track_id):
        if self.reid_model is not None:
            return self.reid_model.get_color_for_track(camera_id, track_id)
        return self._C_PERSON

    @staticmethod
    def _put_label(frame, text, pos, colour):
        x, y = pos
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
        cv2.rectangle(frame, (x, y - th - 6), (x + tw + 2, y), colour, -1)
        cv2.putText(frame, text, (x, y - 4), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (255, 255, 255), 1)

    # ── Video recording ───────────────────────────────────────────────────────
    def handle_recording(self, frame: np.ndarray, trigger_active: bool):
        current_time = time.time()

        if trigger_active and not self.is_recording:
            self.is_recording         = True
            self.recording_start_time = current_time

            timestamp             = time.strftime("%Y%m%d_%H%M%S")
            self.current_filename = f"weapon_evidence_{timestamp}.mp4"
            self.temp_filepath    = os.path.join(self.output_dir, f"temp_{self.current_filename}")
            self.final_filepath   = os.path.join(self.output_dir, self.current_filename)

            height, width     = frame.shape[:2]
            self.video_writer = None
            codecs_to_try     = [self.working_codec] if self.working_codec else self.video_codecs

            for codec in codecs_to_try:
                if codec is None:
                    continue
                try:
                    fourcc = cv2.VideoWriter_fourcc(*codec)
                    writer = cv2.VideoWriter(
                        self.temp_filepath, fourcc, float(self.fps_estimate), (width, height)
                    )
                    if writer.isOpened():
                        self.video_writer  = writer
                        self.working_codec = codec
                        break
                    else:
                        writer.release()
                except Exception:
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
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", self.temp_filepath,
                     "-c", "copy", "-movflags", "+faststart", self.final_filepath],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                if os.path.exists(self.temp_filepath):
                    os.remove(self.temp_filepath)
                print(f">>> Evidence saved: {self.final_filepath}")

                if APP_ENV == "prod":
                    threading.Thread(
                        target=self.upload_to_gcp,
                        args=(self.final_filepath, self.current_filename),
                        daemon=True,
                    ).start()
            except Exception:
                if os.path.exists(self.temp_filepath):
                    os.rename(self.temp_filepath, self.final_filepath)

    def upload_to_gcp(self, file_path, file_name):
        if not self.storage_client:
            return
        try:
            bucket = self.storage_client.bucket(GCP_BUCKET_NAME)
            bucket.blob(file_name).upload_from_filename(file_path)
            print(f"✅ Uploaded: gs://{GCP_BUCKET_NAME}/{file_name}")
        except Exception as e:
            print(f"❌ Upload Failed: {e}")

    # ── Alert acknowledgement ─────────────────────────────────────────────────
    def acknowledge_alert(self, weapon_id_str):
        try:
            weapon_id = int(weapon_id_str)
        except Exception:
            weapon_id = weapon_id_str

        print(f">>> ACK: weapon ID {weapon_id} snoozed 5 min")
        self.acknowledged_detections[weapon_id] = time.time() + 300

        for event in self.event_log:
            if event.get("weapon_track") == weapon_id:
                event["active"] = False

        if self.mqtt_connected:
            try:
                self.client.publish(MQTT_TOPIC_STATUS, json.dumps(self.get_stats(), cls=_NumpyEncoder))
            except Exception:
                pass
