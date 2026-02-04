# Mobile Map Fixes - Summary

## Issues Fixed

### 1. Current Location Defaulting to Google HQ
**Problem**: Origin was defaulting to Google HQ in Silicon Valley instead of specified coordinates.

**Solution**:
- Set `originCoords` to default coordinates (`4.647997024420677, 101.11118512535789`) on initialization
- Set `originLabel` to "Default Location" initially
- When GPS fails or permission is denied, use default coordinates instead of leaving it null
- Updated `refreshCurrentLocation` to fallback to default coordinates on error

### 2. Hazard Markers Not Showing
**Problem**: Markers/beacons not visible on the map.

**Solutions Implemented**:

#### A. Enhanced Data Fetching
- Added fallback to Supabase RPC functions if API fails
- Improved coordinate parsing to handle multiple formats
- Added console logging for debugging

#### B. Improved Marker Rendering
- Increased marker size (50x50 container, 24x24 core)
- Added `anchor={{ x: 0.5, y: 0.5 }}` for proper centering
- Added `tracksViewChanges={false}` for better performance
- Added `title` and `description` props for better UX
- Set `pointerEvents="none"` on custom view to prevent interaction issues

#### C. Debugging Tools
- Added debug panel (development only) showing:
  - Total hazards count
  - Hazards with valid coordinates
  - Current origin coordinates

## Technical Details

### Marker Implementation
React Native Maps supports custom views in Marker components. The implementation uses:
- Custom View with multiple layers (glow, core, inner)
- Color-coded: Red (#ff0040) for immediate danger, Yellow (#ffcc00) for suspicious
- Proper anchor point for centering
- Performance optimizations

### Data Fetching Strategy
1. **Primary**: Try backend API endpoint (`/alerts/nearby`)
2. **Fallback**: Use Supabase RPC functions directly:
   - `find_immediate_dangers_nearby()`
   - `find_suspicious_nearby()`

### Safety Score Calculation
- Real-time updates when hazards change
- Distance-weighted scoring
- Immediate dangers: -35 points
- Suspicious activities: -15 points
- Score range: 0-100%

## Testing Checklist

- [ ] Map centers on `4.647997024420677, 101.11118512535789` on load
- [ ] Origin shows "Default Location" initially
- [ ] Markers appear for hazards in database
- [ ] Red markers for immediate dangers
- [ ] Yellow markers for suspicious activities
- [ ] Safety percentage updates in real-time
- [ ] Hazard count updates in real-time
- [ ] Debug panel shows correct counts (dev mode only)

## Troubleshooting

### If markers still don't show:
1. Check console logs for "Fetched hazards from..." messages
2. Verify debug panel shows hazards > 0
3. Check if coordinates are valid (not 0,0)
4. Verify database has mock data inserted
5. Check if RPC functions exist in Supabase

### If origin still wrong:
1. Check `originCoords` state in debug panel
2. Verify default coordinates are set on mount
3. Check GPS permission status
4. Verify fallback logic executes on GPS error

## Known Limitations

- Custom marker views in react-native-maps work but may have rendering quirks on some devices
- If markers still don't appear, we may need to use default pin markers with `pinColor` prop instead
- Heatmap layer may obscure markers if opacity is too high
