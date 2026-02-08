-- 1. Enable PostGIS Extension (Crucial for "Nearby" queries)
create extension if not exists postgis;

-- 2. Create Enum Types (To keep data clean)
create type user_role as enum ('citizen', 'admin', 'iot_device');
create type danger_type as enum ('fight', 'weapon', 'fall', 'robbery');
create type loitering_status as enum ('pending', 'investigating', 'resolved', 'false_alarm');

-- 3. Profiles Table (Linked to Auth)
create table profiles (
  id uuid references auth.users not null primary key,
  role user_role default 'citizen',
  created_at timestamptz default now()
);

-- 4. Path 2: Suspicious Activity Log (For Manual Tickets)
create table suspicious_individual_logs (
  id uuid default gen_random_uuid() primary key,
  location_name text,
  location_id text, -- Camera/location identifier (for IoT devices)
  coordinates geography(Point, 4326), -- The magic column for Maps
  person_id_hash text,
  evidence_video_url text, -- Link to Google Cloud Storage
  status loitering_status default 'pending',
  detected_at timestamptz default now()
);

-- 5. Path 1: Immediate Danger Log (For Red Beacons)
create table immediate_danger_logs (
  id uuid default gen_random_uuid() primary key,
  location_name text,
  coordinates geography(Point, 4326),
  activity_type danger_type,
  evidence_video_url text,
  is_active boolean default true,
  detected_at timestamptz default now()
);

-- 6. Spatial Indexing (Makes map queries fast)
create index suspicious_geo_idx on suspicious_individual_logs using GIST (coordinates);
create index danger_geo_idx on immediate_danger_logs using GIST (coordinates);

-- 7. Secure the data (Row Level Security)
alter table suspicious_individual_logs enable row level security;
alter table immediate_danger_logs enable row level security;

-- Policy: Everyone can READ (for the AR app), but only IoT/Admins can INSERT
create policy "Public Read Access" on suspicious_individual_logs for select using (true);
create policy "IoT Insert Access" on suspicious_individual_logs for insert with check (auth.role() = 'service_role');

create policy "Public Read Access" on immediate_danger_logs for select using (true);
create policy "IoT Insert Access" on immediate_danger_logs for insert with check (auth.role() = 'service_role');