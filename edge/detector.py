from ultralytics import YOLO
from tracker import Tracker
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