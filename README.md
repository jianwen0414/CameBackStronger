# 🌃 NightWalk - Urban Safety Ecosystem

> A hackathon project for SDG 11: Sustainable Cities and Communities

NightWalk is a comprehensive urban safety platform that combines IoT surveillance, AR visualization, and real-time dashboards to create safer cities.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NightWalk Ecosystem                      │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   🤖 Backend    │   📱 Mobile     │        🖥️ Web Dashboard      │
│   (FastAPI)     │   (React Native)│        (React + Vite)        │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • CCTV Ingestion│ • AR Scanner    │ • God View (3D City)        │
│ • PostGIS Query │ • Heatmap       │ • Analytics Panel           │
│ • Auth          │ • Realtime Alerts│ • Evidence Video           │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         └─────────────────┴───────────────────────┘
                           │
              ┌────────────┴────────────┐
              │      Supabase           │
              │  (PostgreSQL + PostGIS) │
              │  + Realtime             │
              └─────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Android Studio (for mobile)
- Supabase project with PostGIS enabled
- Google Cloud APIs:
  - ARCore Geospatial API key
  - Maps JavaScript API with Photorealistic 3D Tiles

### 1️⃣ Backend Setup

```bash
cd backend
uv sync

# Copy and configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run PostGIS setup in Supabase SQL Editor
# (Copy contents of sql/setup_postgis.sql)

# Start server
uv run uvicorn main:app --reload
```

API will be available at `http://localhost:8000`

### 2️⃣ Web Dashboard Setup

```bash
cd web
npm install

# Copy and configure environment
cp .env.example .env
# Add your Supabase and Google Maps API keys

# Start dev server
npm run dev
```

Dashboard will be available at `http://localhost:5173`

### 3️⃣ Mobile App Setup

```bash
cd mobile
npm install

# Copy and configure environment
cp .env.example .env
# Add your Supabase and Google Maps API keys

# Android
npx react-native run-android
```

> **Note:** Mobile requires an ARCore-compatible Android device/emulator

## 📁 Project Structure

```
├── backend/                 # Python FastAPI Backend
│   ├── main.py             # API endpoints
│   ├── schemas.py          # Pydantic models
│   ├── database.py         # Supabase + PostGIS
│   └── sql/                # Database setup scripts
│
├── web/                     # React Web Dashboard
│   ├── src/
│   │   ├── components/     # GodView, Analytics, Modal
│   │   ├── store/          # Zustand state
│   │   └── lib/            # Supabase client
│
└── mobile/                  # React Native Mobile App
    ├── android/
    │   └── app/src/.../    # GeospatialModule.kt (ARCore)
    └── src/
        ├── screens/        # Scanner, Map, Alerts
        ├── store/          # Zustand state
        └── native/         # Native module wrappers
```

## 🔧 Tech Stack

| Component | Technologies |
|-----------|--------------|
| **Backend** | FastAPI, Supabase, PostGIS, Pydantic |
| **Mobile** | React Native CLI, ARCore Geospatial, Skia, Maps |
| **Web** | React, Vite, deck.gl, Google 3D Tiles, Recharts |
| **State** | Zustand (both mobile & web) |
| **Realtime** | Supabase Realtime |
| **Styling** | Tailwind CSS (web), Cyberpunk theme |

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/alerts/cctv` | Receive IoT camera alerts |
| `GET` | `/alerts/nearby?lat=&long=&radius=` | Query nearby hazards |
| `GET` | `/alerts/all` | Get all alerts for dashboard |
| `POST` | `/auth/login` | Verify Supabase auth token |

## 🌐 Environment Variables

### Backend (`.env`)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx
```

### Web (`.env`)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_GOOGLE_MAPS_API_KEY=xxx
```

### Mobile (`.env`)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
GOOGLE_MAPS_API_KEY=xxx
```

## 🎨 Design System

The UI follows a **Cyberpunk** aesthetic with:
- 🌑 Deep dark backgrounds (`#0a0a0f`)
- 💎 Neon accent colors (cyan `#00f5ff`, red `#ff0040`)
- ✨ Glassmorphism effects
- 🔥 Pulsing beacon animations for alerts

## 📜 License

MIT License - Built for SDG 11 Hackathon
