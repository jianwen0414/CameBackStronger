# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NightWalk** — an urban safety ecosystem combining real-time IoT weapon detection, cross-camera person re-identification, a web control-room dashboard, and a mobile AR app. All services share a Supabase backend (PostgreSQL + PostGIS + pgvector + Realtime).

---

## Services & How to Run Them

All Python packages use **`uv`** as the package manager. All JavaScript packages use **`npm`**.

### Edge (AI weapon detector)
```bash
cd edge
uv sync                        # base deps only
uv sync --extra reid           # + torch/torchvision for PersonReID
uv sync --extra vector-store   # + supabase client for pgvector

python main.py                 # production — streams via RTSP to MediaMTX
python test.py                 # standalone test — opens webcam with live overlay
```
Requires a YOLO model at `edge/model/best.pt` or `edge/model/best.onnx`.

### Backend (FastAPI)
```bash
cd backend
uv sync
uv run uvicorn main:app --reload   # dev server at http://localhost:8000
uv run pytest test_pipeline.py     # run validation pipeline tests
```

### Web dashboard
```bash
cd web
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run lint     # ESLint
```

### Mobile (React Native)
```bash
cd mobile
npm install
npm start                          # Metro bundler
npx react-native run-android       # Android (physical device for ARCore)
npm test                           # Jest tests
```

### MQTT broker
```bash
docker run -d -p 1883:1883 -p 9001:9001 \
  -v $(pwd)/mosquitto/config:/mosquitto/config \
  -v $(pwd)/mosquitto/data:/mosquitto/data \
  eclipse-mosquitto
```

---

## Architecture

### Data flow
```
Edge devices
  │
  ├─ MQTT (Paho) → Mosquitto :1883
  │    topics: cam-XX/status | cam-XX/alert | cam-XX/ack
  │
  ├─ HTTP POST → Backend /alerts/cctv
  │
  └─ Supabase pgvector
       weapon_holder_embeddings (cross-camera ReID)

Backend (FastAPI)
  ├─ Supabase PostgreSQL + PostGIS  (alert tables, spatial queries)
  ├─ Google Gemini API              (AI video analysis)
  └─ Google Cloud Storage           (evidence videos)

Web / Mobile
  ├─ Backend REST API
  ├─ Supabase Realtime              (live alert feed)
  └─ Google Maps / ARCore
```

### Edge weapon-detection pipeline (`edge/detector.py`)

The core logic is a **per-weapon state machine** with three states:

| State | Meaning |
|---|---|
| `UNOWNED` | Weapon visible, no confirmed holder yet |
| `OWNED` | Person confirmed holding weapon (`confirm_frames` consecutive IoU hits) |
| `LOCKED_ORPHAN` | Owner left frame; weapon held in alert state for `orphan_timeout_frames` |

On the UNOWNED → OWNED transition the detector:
1. Checks the local in-memory ReID gallery (`PersonReID._find_gallery_match`)
2. If no hit and `SupabaseVectorStore` is available, calls `find_similar` (blocking) against Supabase pgvector
3. Mints a globally unique `person_id` via `next_person_id()` RPC (falls back to local counter)
4. Fire-and-forgets `store_embedding` in a daemon thread

### PersonReID (`edge/reidentification.py`)

- ResNet50 backbone, FC → Identity → **2048-dim L2-normalised** feature vectors
- Rolling window of 10 features per track; gallery only contains confirmed weapon holders
- `_find_gallery_match` is the fast in-memory path; `SupabaseVectorStore.find_similar` is the persistent cross-node/cross-restart path

### Supabase vector store (`edge/vector_store.py`)

- Embeddings are **randomly projected 2048 → 2000** before storage (pgvector `ivfflat` hard limit)
- Projection matrix: `np.random.default_rng(seed=42).standard_normal((2000, 2048))` — **fixed seed is critical**: every edge node must use the same matrix or cross-node similarity breaks
- Graceful degradation: if `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are unset, the store is `None` and the system runs in-memory only

### Backend alert types (`backend/schemas.py`)

- `AlertType`: `fight | weapon | robbery | loitering | suspicious`
- Two separate log tables: `immediate_danger_logs` (red beacons) and `suspicious_individual_logs` (yellow/orange)
- `user_reported_crimes` goes through an AI validation pipeline (VideoMAE → Gemini) before reaching the map

### Web dashboard (`web/src`)

- State lives in Zustand (`src/store/useAlertStore.ts`)
- "God View" tab: deck.gl + Google 3D Tiles for 3D map
- "Analytics" tab: Recharts charts
- Design system: cyberpunk theme — dark background `#0a0a0f`, neon cyan `#00f5ff`, neon red `#ff0040`, glassmorphism cards in `src/components/ui/`

---

## Configuration

Every service reads from a `.env` file (gitignored). Key variables:

| Service | Variable | Purpose |
|---|---|---|
| edge | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | pgvector store |
| edge | `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT` | broker address |
| edge | `CAMERA_ID`, `CAP_WIDTH/HEIGHT/FPS` | capture device |
| edge | `IMGSZ`, `FRAME_SKIP` | inference tuning |
| backend | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | DB access |
| backend | `GEMINI_API_KEY` | AI video analysis |
| web | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client auth |
| web | `VITE_GOOGLE_MAPS_API_KEY` | 3D tiles |
| mobile | `API_BASE_URL` | backend URL (use `10.0.2.2:8000` for Android emulator) |

---

## Database (Supabase)

SQL migrations live in `backend/sql/`. Run them in order in the Supabase SQL editor:
1. `setup_postgis.sql` — PostGIS extension
2. `setup_tables.sql` — core alert tables
3. `setup_cctv_and_reports.sql` — CCTV + crime reports
4. `setup_profiles.sql` — user profiles
5. `enable_realtime_all.sql` — Supabase Realtime

The pgvector table (`weapon_holder_embeddings`) and its RPCs (`match_weapon_holder`, `next_weapon_person_id`) are defined in `edge/vector_store.py`'s module docstring — copy that SQL block into the Supabase SQL editor.

---

## Key Constraints & Gotchas

- **pgvector ivfflat max dimension is 2000** — that is why the random projection exists; never change `_PROJ_OUT` or `seed=42` without dropping and recreating the embeddings table.
- The YOLO model has **3 classes only**: `0=Gun, 1=Knife, 2=Person`. Per-class confidence thresholds differ (`CLASS_CONF` in `detector.py`).
- `reid_model` and `vector_store` are both optional; `detector.py` degrades gracefully when either is `None`.
- The ARCore Geospatial scanner requires a **physical Android device** — it does not work in emulators.
- MQTT topics are per-camera (`cam-01/…`, `cam-02/…`) and must match both the edge `.env` and any subscriber.
