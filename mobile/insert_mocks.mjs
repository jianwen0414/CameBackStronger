import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vmkjfnszfizxlrcgmiec.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZta2pmbnN6Zml6eGxyY2dtaWVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTczODE3OCwiZXhwIjoyMDg1MzE0MTc4fQ.vbQ44Y-13hqxH0QlSqz--lBIwcRSNeDM5d8c9k_MZGk';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function insertMocks() {
    console.log('Inserting new exact danger...');

    let point = `POINT(101.65564219147588 3.121045820489224)`;
    console.log(`Inserting danger exactly at: ${point}`);
    const { error } = await supabase.from('immediate_danger_logs').insert([
        {
            coordinates: point,
            activity_type: 'weapon',
            evidence_video_url: 'https://example.com/mock.mp4',
            is_active: true,
            detected_at: new Date().toISOString()
        }
    ]);
    if (error) console.error('Error inserting new danger:', error);

    console.log('Done inserted new mock data!');
}

insertMocks().catch(console.error);
