# Fix: Enum Type Casting Error

## Error Message
```
Error fetching immediate dangers: {
  code: '42804', 
  details: 'Returned type danger_type does not match expected type text in column 4.',
  message: 'structure of query does not match function result type'
}
```

## Root Cause
The RPC functions `find_immediate_dangers_nearby` and `find_suspicious_nearby` return enum types (`danger_type` and `loitering_status`) but the function signature declares them as `TEXT`. PostgreSQL requires explicit casting.

## Solution
Run `fix_enum_casting.sql` in Supabase SQL Editor. This will:
1. Cast `activity_type::TEXT` in `find_immediate_dangers_nearby`
2. Cast `status::TEXT` in `find_suspicious_nearby`
3. Grant proper permissions

## Quick Fix (if you prefer to run manually)

```sql
-- Fix immediate dangers function
CREATE OR REPLACE FUNCTION find_immediate_dangers_nearby(...)
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ...
        idl.activity_type::TEXT as activity_type,  -- Added ::TEXT cast
        ...
END;
$$;

-- Fix suspicious logs function  
CREATE OR REPLACE FUNCTION find_suspicious_nearby(...)
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ...
        sil.status::TEXT as status,  -- Added ::TEXT cast
        ...
END;
$$;
```

## After Running the Fix
1. Markers should now appear on the mobile map
2. Hazards should be fetched successfully
3. Safety percentage should calculate correctly
4. Real-time updates should work
