# 🌃 JAGAJAGA — Urban Safety Ecosystem

> AI-Powered Weapon Detection, Cross-Camera Person Tracking & Real-Time Threat Intelligence

[![Demo Video](https://img.shields.io/badge/Demo-Video-red?style=for-the-badge&logo=youtube)](https://youtu.be/A0m7RtnW-kc)
[![Documentation](https://img.shields.io/badge/Docs-Read-blue?style=for-the-badge&logo=gitbook )]([YOUR_DOCS_LINK](https://drive.google.com/file/d/1lrfu-bRk4xFcJyZWZqhl92ECXAQsct0s/view?usp=sharing))

**JAGAJAGA** is a comprehensive urban safety platform that combines **AI weapon detection**, **cross-camera person re-identification**, and **real-time command center dashboards** to create safer cities. Built for SDG 11: Sustainable Cities and Communities and SDG 16: Peace, Justice and Strong Institutions

## ✨ Key Features

- 🎯 **Real-time Weapon Detection** — YOLOv8-based detection at 15-20 FPS
- 👤 **Cross-Camera Person Tracking** — ResNet50 ReID with pgvector persistence
- 📹 **Automatic Evidence Collection** — 20-second annotated clips per alert
- 🗺️ **3D Command Center Dashboard** — Live map with Google Photorealistic 3D Tiles
- 📊 **Intelligence Analytics** — Weapon stats, hotspots, ReID tracking metrics
- 📱 **Mobile AR Scanner** — ARCore Geospatial for field operations
- ⚡ **Real-Time Alerts** — Supabase Realtime with toast notifications (<2s latency)
- 🔒 **Alert Deduplication** — 120s cooldown prevents spam from re-detections

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          JAGAJAGA Ecosystem                            │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│   🎥 Edge AI     │   🤖 Backend     │   🖥️ Web         │  📱 Mobile    │
│   (Python)       │   (FastAPI)      │   (React+Vite)   │  (RN+ARCore)  │
├──────────────────┼──────────────────┼──────────────────┼───────────────┤
│ • YOLOv8 detect  │ • REST API       │ • 3D Map (deck)  │ • AR Scanner  │
│ • ReID (ResNet)  │ • PostGIS query  │ • Analytics      │ • Alert feed  │
│ • MJPEG stream   │ • Evidence serve │ • Evidence modal │ • Heatmap     │
│ • MQTT publish   │ • Gemini AI      │ • Person track   │ • Geospatial  │
│ • pgvector store │ • GCS upload     │ • Realtime sub   │ • Supabase    │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴───────┬───────┘
         │                  │                  │                 │
         └──────────────────┴──────────────────┴─────────────────┘
                            │
               ┌────────────┴──────────────┐
               │       Supabase            │
               │  PostgreSQL + PostGIS     │
               │  + pgvector + Realtime    │
               └───────────────────────────┘
                            │
               ┌────────────┴──────────────┐
               │      MediaMTX (RTSP)      │
               │  Multi-camera streaming   │
               └───────────────────────────┘
```

### Data Flow

1. **Edge devices** run YOLOv8 weapon detection + person ReID
2. **Detections** → POST to backend `/alerts/cctv` with person_id + GPS coords
3. **Backend** → Stores in PostgreSQL, triggers Supabase Realtime broadcast
4. **Web dashboard** → Receives live updates, fetches evidence videos
5. **Person ReID** → pgvector cross-process matching across cameras
6. **Evidence clips** → Auto-recorded (10s pre + 10s post), served via `/evidence/`

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/) package manager
- **Node.js 20+** and npm
- **Docker & Docker Compose** (for MediaMTX RTSP server)
- **NVIDIA GPU** with CUDA support (for edge AI inference)
- **Supabase project** with PostGIS + pgvector extensions enabled
- **Google Cloud APIs:**
  - ARCore Geospatial API key (mobile)
  - Maps JavaScript API with Photorealistic 3D Tiles (web)

---

## 🛠️ Setup Instructions

### 1️⃣ Database Setup (Supabase)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run SQL migrations in order via Supabase SQL Editor:
   - `backend/sql/setup_postgis.sql` — Enable PostGIS extension
   - `backend/sql/setup_tables.sql` — Core alert tables
   - `backend/sql/setup_cctv_and_reports.sql` — CCTV cameras + crime reports
   - `backend/sql/setup_profiles.sql` — User profiles
   - `backend/sql/enable_realtime_all.sql` — Enable Realtime subscriptions
3. Copy the pgvector setup SQL from `edge/vector_store.py` docstring and run it
4. Save your **Supabase URL**, **Anon Key**, and **Service Key**

### 2️⃣ Backend Setup

```bash
cd backend

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env and add:
#   SUPABASE_URL=https://xxx.supabase.co
#   SUPABASE_SERVICE_KEY=xxx
#   GEMINI_API_KEY=xxx (optional, for AI crime validation)

# Start FastAPI server
uv run uvicorn main:app --reload
```

Backend API: **http://localhost:8000** | Docs: **http://localhost:8000/docs**

### 3️⃣ Edge AI Setup

```bash
cd edge

# Install base dependencies
uv sync

# Install ReID + vector store extras
uv sync --extra reid --extra vector-store

# Configure environment
cp .env.example .env
# Add:
#   SUPABASE_URL=https://xxx.supabase.co
#   SUPABASE_SERVICE_KEY=xxx
#   CAMERA_NAME=CAM-001
#   CAMERA_LAT=4.6475
#   CAMERA_LONG=101.1108

# Download YOLO model weights to edge/model/best.onnx or best.pt

# Single camera (live feed + MJPEG stream on :8090)
python main.py

# Multi-camera demo (4 clips, ReID tracking)
python run_clips.py
```

**Live MJPEG stream:** http://localhost:8090/

### 4️⃣ MediaMTX (RTSP/HLS Server)

```bash
# Start RTSP server
docker compose up mediamtx
```

**RTSP:** `rtsp://localhost:8554/` | **HLS:** http://localhost:8889/

### 5️⃣ Web Dashboard Setup

```bash
cd web

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add:
#   VITE_SUPABASE_URL=https://xxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=xxx
#   VITE_GOOGLE_MAPS_API_KEY=xxx

# Start dev server
npm run dev
```

Dashboard: **http://localhost:5173**

### 6️⃣ Mobile App Setup (Optional)

```bash
cd mobile

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add your Supabase URL, anon key, and Google Maps key

# Android (requires ARCore-compatible device)
npx react-native run-android

# iOS (requires Xcode)
npx react-native run-ios
```

> **Note:** AR scanner requires a physical device with ARCore Geospatial support

---

## 📁 Project Structure

```
.
├── backend/                    # FastAPI Backend
│   ├── main.py                # API routes & endpoints
│   ├── database.py            # Supabase + PostGIS queries
│   ├── schemas.py             # Pydantic models
│   ├── validation_pipeline.py # AI crime report validation
│   └── sql/                   # Database migrations
│       ├── setup_postgis.sql
│       ├── setup_tables.sql
│       ├── setup_cctv_and_reports.sql
│       ├── setup_profiles.sql
│       └── enable_realtime_all.sql
│
├── edge/                       # Edge AI Detection
│   ├── main.py                # Single camera detector (MJPEG server)
│   ├── run_clips.py           # Multi-camera demo script
│   ├── detector.py            # Weapon detection + state machine
│   ├── reidentification.py   # Person ReID (ResNet50)
│   ├── vector_store.py        # Supabase pgvector integration
│   ├── model/                 # YOLO model weights (best.onnx/pt)
│   ├── clips/                 # Demo video clips (clip2-5.mp4)
│   └── evidence/              # Recorded evidence videos
│
├── web/                        # React Dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── GodView.tsx           # 3D map with beacons
│   │   │   ├── EvidenceModal.tsx     # Alert details + video player
│   │   │   ├── PersonTrackingPage.tsx # Cross-camera timeline
│   │   │   ├── AnalyticsPanel.tsx    # Charts & statistics
│   │   │   ├── LiveAnalyticsOverlay.tsx # Real-time camera stats
│   │   │   └── ui/                   # Reusable UI components
│   │   ├── store/
│   │   │   └── useAlertStore.ts      # Zustand state management
│   │   └── lib/
│   │       └── supabase.ts           # Supabase client + types
│   └── public/                       # Static assets
│
├── mobile/                     # React Native App
│   ├── android/
│   │   └── app/src/main/.../GeospatialModule.kt  # ARCore native module
│   ├── src/
│   │   ├── screens/           # Scanner, Map, Alerts
│   │   ├── store/             # Zustand state
│   │   └── native/            # Native bridge wrappers
│   └── package.json
│
├── mosquitto/                  # MQTT broker config
│   ├── config/mosquitto.conf
│   └── data/
│
├── mediamtx.yml               # MediaMTX RTSP/HLS config
├── docker-compose.yaml        # MediaMTX + Mosquitto services
└── README.md
```

---

## 🔧 Technology Stack

### Edge AI (Python)
- **YOLOv8** (Ultralytics) — Weapon detection (Gun, Knife, Person)
- **ResNet50** (PyTorch) — Person re-identification (2048-dim features)
- **OpenCV** — Video capture & processing
- **ONNX Runtime** — GPU-accelerated inference (CUDA)
- **MQTT** (Paho) — Real-time analytics pub/sub
- **MJPEG Server** — Low-latency HTTP streaming

### Backend (Python)
- **FastAPI** — REST API framework
- **Supabase Python Client** — Database operations
- **PostGIS** — Spatial queries (nearby alerts, geo-fencing)
- **pgvector** — Vector similarity search for ReID
- **Google Gemini** — AI-powered crime report validation
- **Google Cloud Storage** — Evidence video storage (production)
- **Pydantic** — Data validation & serialization

### Web Dashboard (TypeScript/JavaScript)
- **React 18** + **Vite** — Frontend framework
- **TypeScript** — Type safety
- **Zustand** — State management
- **deck.gl** — WebGL-powered 3D map rendering
- **Google 3D Tiles** — Photorealistic city visualization
- **Recharts** — Analytics charts (area, bar, pie, line)
- **Tailwind CSS** — Utility-first styling
- **Framer Motion** — Animations
- **Supabase Realtime** — Live subscriptions
- **Sonner** — Toast notifications

### Mobile (React Native)
- **React Native CLI** — Mobile framework
- **ARCore Geospatial** (Kotlin) — AR positioning
- **React Native Maps** — Map integration
- **React Native Skia** — Custom canvas rendering
- **Zustand** — State management
- **Supabase JS Client** — Backend integration

### Infrastructure
- **Supabase** — PostgreSQL + PostGIS + pgvector + Realtime + Auth
- **MediaMTX** — RTSP/HLS/WebRTC streaming server
- **Mosquitto** — MQTT message broker
- **Docker Compose** — Service orchestration

---

## 🔌 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/alerts/cctv` | Receive weapon detection from edge devices |
| `PATCH` | `/alerts/danger/{id}/evidence` | Update evidence URL after recording |
| `GET` | `/alerts/nearby?lat=&long=&radius=` | Query alerts within radius |
| `GET` | `/alerts/all` | Get all alerts for dashboard |
| `GET` | `/reid/track/{person_id}` | Get cross-camera sightings for person |
| `POST` | `/cctv/cameras` | Register new CCTV camera |
| `GET` | `/cctv/cameras` | List all cameras |
| `PATCH` | `/cctv/cameras/{name}` | Update camera stream URL |
| `POST` | `/reports/crime` | Submit user-reported crime (mobile) |
| `GET` | `/reports/validate/{id}` | Trigger AI validation pipeline |
| `POST` | `/auth/login` | Verify Supabase auth token |

### Static File Serving

| Path | Content |
|------|---------|
| `/evidence/` | Edge-recorded evidence videos (`weapon_evidence_*.mp4`) |
| `/clips/` | Demo video clips (fallback when evidence unavailable) |

### MQTT Topics (Edge → Dashboard)

| Topic | Payload | Description |
|-------|---------|-------------|
| `{camera}/status` | `{"online": bool}` | Camera heartbeat |
| `{camera}/alert` | `{"weapon_id": int, "type": str}` | New detection |
| `{camera}/analytics` | `{"persons": int, "guns": int, "knives": int}` | Live stats |
| `{camera}/ack` | `{"weapon_id": int}` | Alert acknowledged (snooze 5 min) |

---

## 🌐 Environment Variables

### Backend (`.env`)
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service role key (full access)

# Google Cloud (optional)
GEMINI_API_KEY=AIza...  # For crime report validation
GCP_PROJECT_ID=your-project
GCS_BUCKET_NAME=evidence-bucket

# App
APP_ENV=dev  # or prod
```

### Edge (`.env`)
```bash
# Supabase (for pgvector cross-camera ReID)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...

# Backend API
BACKEND_URL=http://localhost:8000

# Camera Configuration
CAMERA_NAME=CAM-001
CAMERA_ID=clips/clip2.mp4  # or 0 for webcam, or RTSP URL
CAMERA_LAT=4.6475
CAMERA_LONG=101.1108

# Detection Settings
IMGSZ=416           # YOLO input size (smaller = faster)
FRAME_SKIP=2        # Process every Nth frame
CONF_THRESHOLD=0.3  # Object confidence threshold

# Streaming
ENABLE_RTSP=0       # 1 to enable MediaMTX RTSP (main.py)
ENABLE_RAW_STREAM=0 # 1 to enable secondary raw stream
MJPEG_PORT=8090     # HTTP MJPEG server port
STREAM_WIDTH=1280   # Stream resolution
STREAM_HEIGHT=720
STREAM_FPS=30
JPEG_QUALITY=85

# ReID & Alerts
ALERT_COOLDOWN=120  # Seconds to suppress duplicate person+weapon alerts
USE_REID=1          # Enable cross-camera person tracking

# MQTT (optional, for analytics overlay)
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883

# MediaMTX
MEDIAMTX_URL=rtsp://localhost:8554
```

### Web (`.env`)
```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...  # Anon/public key

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=AIza...  # Enable Maps JS API + 3D Tiles

# Backend
VITE_BACKEND_URL=http://localhost:8000
```

### Mobile (`.env`)
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...

# Google Maps & ARCore
GOOGLE_MAPS_API_KEY=AIza...  # Enable ARCore Geospatial API

# Backend (use 10.0.2.2:8000 for Android emulator)
API_BASE_URL=http://localhost:8000
```

---

## 🎨 Design System

The UI follows a **Cyberpunk/Command Center** aesthetic:

### Color Palette
- **Background:** Deep dark (`#050505`, `#0a0a0f`)
- **Accent Cyan:** `#00aaff` (cameras, primary actions)
- **Danger Red:** `#ef4444` (weapon alerts)
- **Warning Yellow:** `#eab308` (suspicious activity)
- **Purple:** `#a855f7` (user reports, person tracking)
- **Neon Effects:** Pulsing beacon animations, glow effects

### Visual Elements
- ✨ **Glassmorphism** cards with backdrop blur
- 🔥 **Animated beacons** with ripple effects (red/yellow/blue/purple)
- 🌌 **Dotted grid background** with radial gradients
- 📊 **Neon charts** with gradient fills
- 🎯 **Smooth transitions** with Framer Motion

### Typography
- **Headers:** Bold, tight tracking
- **Data:** Monospace fonts for numbers, IDs, timestamps
- **Labels:** Uppercase, wide tracking

---

## 🧪 Testing

### Backend Tests
```bash
cd backend
uv run pytest test_pipeline.py -v
```

### Web Type Checking
```bash
cd web
npm run type-check  # or: npx tsc --noEmit
```

### Mobile Tests
```bash
cd mobile
npm test
```

---

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| **AI Inference FPS** | 15-20 (CUDA GPU) |
| **ReID Matching Accuracy** | 0.82 similarity (demo) |
| **Alert Latency** | <2 seconds (detection → dashboard) |
| **Stream Latency** | ~200ms (MJPEG), ~2-3s (HLS) |
| **Evidence Recording** | 20 seconds (10s pre + 10s post) |
| **Alert Cooldown** | 120 seconds (prevents spam) |
| **Dashboard Load Time** | <1s (with Supabase Realtime) |

---

## 🐛 Troubleshooting

### Edge Issues

**YOLO model not loading:**
```bash
# Download model weights
# Place best.onnx or best.pt in edge/model/
```

**pgvector connection failed:**
```bash
# Verify Supabase setup
# Run SQL from edge/vector_store.py docstring
# Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
```

**MJPEG stream not showing:**
```bash
# Check if port 8090 is free
netstat -an | grep 8090
# Verify ENABLE_RTSP=0 in .env (disable conflicting RTSP)
```

### Backend Issues

**Database connection error:**
```bash
# Verify Supabase credentials
# Check if PostGIS extension is enabled
# Ensure all SQL migrations are run
```

**Evidence videos 404:**
```bash
# Check files exist in edge/evidence/
ls -lh edge/evidence/weapon_evidence_*.mp4
# Verify backend mounts ../edge/evidence as static files
```

### Web Issues

**Map not loading:**
```bash
# Verify Google Maps API key has 3D Tiles enabled
# Check browser console for API errors
# Ensure VITE_GOOGLE_MAPS_API_KEY is set
```

**Alerts not showing:**
```bash
# Check Supabase Realtime is enabled (run enable_realtime_all.sql)
# Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# Refresh page (F5) to reconnect Realtime
```

**Person tracking empty:**
```bash
# Confirm immediate_danger_logs have person_id values
# Check /reid/track/{person_id} endpoint in backend
# Verify cross-camera ReID ran (look for "pgvector cross-process match" in edge logs)
```

### MediaMTX Issues

**RTSP streams not working:**
```bash
# Check MediaMTX is running
docker compose ps

# Verify mediamtx.yml has paths.all_others catch-all
# Check logs: docker compose logs mediamtx

# Test RTSP URL directly
ffplay rtsp://localhost:8554/cam001
```

---

## 🚀 Deployment

### Production Considerations

**Edge Devices:**
- Use NVIDIA Jetson (Nano, Xavier, Orin) for cost-effective edge AI
- Enable `APP_ENV=prod` to trigger GCS video uploads
- Set `ENABLE_RTSP=1` for centralized streaming
- Configure static IPs for RTSP URLs

**Backend:**
- Deploy to cloud (Fly.io, Railway, AWS EC2)
- Use managed PostgreSQL with PostGIS (Supabase, AWS RDS)
- Enable HTTPS with Let's Encrypt
- Set up CORS for production domains

**Web Dashboard:**
- Build with `npm run build` → deploy `dist/` to Vercel, Netlify, or S3+CloudFront
- Update `VITE_BACKEND_URL` to production API domain
- Restrict Google Maps API key to production domain

**Mobile App:**
- Build release APK: `cd android && ./gradlew assembleRelease`
- Configure production `API_BASE_URL`
- Submit to Google Play Store

---

## 📄 License

MIT License — Free to use for educational and commercial purposes.

---

## 🔗 Links

- **📹 Demo Video:** https://youtu.be/A0m7RtnW-kc
- **📖 Documentation:** https://drive.google.com/file/d/1lrfu-bRk4xFcJyZWZqhl92ECXAQsct0s/view?usp=sharing
- **📖 Presentation Slides:** https://drive.google.com/file/d/1-wrG1mzZGhh3nb9XsytutMO1NmDNHTTm/view?usp=sharing

---

## 🙏 Acknowledgments

- **YOLOv8** by Ultralytics
- **ResNet50** for person re-identification
- **Supabase** for backend infrastructure
- **Google** for Maps & ARCore APIs
- **deck.gl** for 3D visualization
- **FastAPI** framework
- **React** & **React Native** ecosystems

---

**Built with ❤️ for safer cities**
