import time
import subprocess
import threading
import os
from dotenv import load_dotenv
from camera_service import CameraService
from luggage_detector import LuggageDetector
import paho.mqtt.client as mqtt
import json

load_dotenv()

# CONFIG
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER", "127.0.0.1")
MQTT_BROKER_PORT = os.getenv("MQTT_PORT", 1883)
MQTT_TOPIC_STATUS = os.getenv("MQTT_TOPIC_STATUS", "cam-01/status")
MQTT_TOPIC_ALERT = os.getenv("MQTT_TOPIC_ALERT", "cam-01/alert")
RTSP_URL = os.getenv("RTSP_URL", "rtsp://localhost:8554/mystream")  # Local MediaMTX

mqtt_client = mqtt.Client()

try:
    # Connect to the broker
    mqtt_client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, 60)
    
    # Start the background loop so it sends messages automatically
    mqtt_client.loop_start()
    print(f"✅ Sync Client Connected to {MQTT_BROKER_HOST}")
except Exception as e:
    print(f"⚠️ Sync Client Connection Failed: {e}")

# 1. Start Camera & AI
camera = CameraService(source=0)
detector = LuggageDetector()

# 2. Start FFmpeg Streamer (Pipes video to MediaMTX)
ffmpeg_cmd = [
    'ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
    '-pix_fmt', 'bgr24', '-s', '640x480', '-r', '20',
    '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-f', 'rtsp', RTSP_URL
]
# Start FFmpeg as a subprocess
ffmpeg_process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

print(">>> Edge AI Started. Streaming to MediaMTX...")

def publish_data(stats, alerts):
    """Publishes split data to MQTT"""
    try:
        # 1. Send Stats (Fast, frequent updates)
        mqtt_client.publish(MQTT_TOPIC_STATUS, json.dumps(stats), qos=0)
        
        # 2. Send Alerts (Only contains the log list)
        mqtt_client.publish(MQTT_TOPIC_ALERT, json.dumps(alerts), qos=0)
        
    except Exception as e:
        print(f"Publish Error: {e}")

while True:
    # A. Get Frame
    frame = camera.get_frame()
    if frame is None: continue

    # B. Run AI
    # (Update process_frame to just return the annotated frame and list of alert dicts)
    annotated_frame, total_alerts, alert_list = detector.process_frame(frame)

    # C. Stream Video (Write bytes to FFmpeg stdin)
    try:
        ffmpeg_process.stdin.write(annotated_frame.tobytes())
    except BrokenPipeError:
        print("FFmpeg crashed. Restarting...")
        # Add restart logic here if needed

    # D. Sync Data (Every 1 second)
    # You can optimize this to only send when data changes
    if int(time.time()) % 2 == 0:
        threading.Thread(target=publish_data, args=(detector.get_stats(), alert_list)).start()