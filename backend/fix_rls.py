import os
import asyncio
from dotenv import load_dotenv

# Load env file manually for the script
load_dotenv(".env")

from database import get_supabase_client

async def main():
    client = get_supabase_client()
    
    # Enable RLS on storage.objects if not already enabled (cannot use table() easily for storage schema)
    # Actually, we can just use the REST API via the client to execute SQL.
    # Supabase Python client does not have execute_sql out of the box unless we created it.
    
    print("Testing service key connection...")
    try:
        # Just create the bucket if it doesn't exist, we know it does
        # The easiest way to bypass RLS for uploads is actually to create a signed URL
        # or have the backend handle the upload.
        # But wait, mobile app uses anon key. We need to run SQL.
        
        # Let's try to query an existing RPC if they made one
        res = client.rpc('execute_sql', {'sql': "CREATE POLICY \"Public Uploads\" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence-videos');"}).execute()
        print(res)
    except Exception as e:
        print("RPC failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
