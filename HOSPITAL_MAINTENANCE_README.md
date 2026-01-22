# Hospital List Maintenance Guide

## Overview
The Ontario ER Finder app loads its hospital list from a JSON file. You can maintain this list by editing the `hospitals.json` file either locally or on GitHub.

## JSON File Structure

Each hospital entry must include:

```json
{
  "id": "unique_id",
  "name": "Hospital Name",
  "address": "Full Address",
  "city": "City Name",
  "latitude": 43.1234,
  "longitude": -79.5678,
  "phone": "123-456-7890",
  "services": ["Emergency", "Trauma", "Surgery"],
  "waitTimeUrl": "https://hospital-website.com/wait-times",
  "defaultWaitTime": 120
}
```

### Field Descriptions:

- **id**: Unique identifier (e.g., "brampton_civic")
- **name**: Full hospital name
- **address**: Complete street address with postal code
- **city**: City name (used for filtering)
- **latitude**: GPS latitude coordinate
- **longitude**: GPS longitude coordinate  
- **phone**: Hospital phone number
- **services**: Array of services offered
- **waitTimeUrl**: URL to hospital's ER wait time page
- **defaultWaitTime**: Default wait time in minutes (used until real-time data available)

## How to Update the Hospital List

### Option 1: GitHub Hosting (Recommended)

1. **Create a GitHub Repository**
   ```bash
   # Create new repo called "ontario-er-finder"
   # Upload hospitals.json to the main branch
   ```

2. **Get the Raw URL**
   - Go to your `hospitals.json` file on GitHub
   - Click "Raw" button
   - Copy the URL (looks like: `https://raw.githubusercontent.com/YOUR_USERNAME/ontario-er-finder/main/hospitals.json`)

3. **Update Backend Configuration**
   - Edit `/app/backend/.env`
   - Update: `HOSPITAL_JSON_URL=https://raw.githubusercontent.com/YOUR_USERNAME/ontario-er-finder/main/hospitals.json`

4. **Sync the Data**
   ```bash
   curl -X POST http://localhost:8001/api/hospitals/sync
   ```

5. **To Update Hospitals in the Future**
   - Edit `hospitals.json` on GitHub
   - Commit and push changes
   - Call the sync endpoint again (or the app can auto-sync on startup)

### Option 2: Local File

1. **Edit Local File**
   - Edit `/app/hospitals.json`
   
2. **Sync to Database**
   ```bash
   curl -X POST http://localhost:8001/api/hospitals/sync
   ```

## Adding a New Hospital

1. Find the hospital's GPS coordinates (use Google Maps)
2. Get the hospital's phone number
3. Find their ER wait time URL
4. Add a new entry to the JSON file:

```json
{
  "id": "new_hospital_id",
  "name": "New Hospital Name",
  "address": "123 Main St, City, ON A1A 1A1",
  "city": "City",
  "latitude": 43.1234,
  "longitude": -79.5678,
  "phone": "905-123-4567",
  "services": ["Emergency", "Surgery"],
  "waitTimeUrl": "https://newhospital.ca/wait-times",
  "defaultWaitTime": 100
}
```

5. Sync the data

## Removing a Hospital

1. Delete the hospital entry from `hospitals.json`
2. Sync the data (this will replace all hospitals with the new list)

## Updating Wait Time URLs

Currently, wait times use `defaultWaitTime`. To implement real-time wait time scraping:

1. Update the `waitTimeUrl` for each hospital
2. Implement a scraper service (future enhancement)
3. The scraper will fetch real wait times from hospital websites

## Testing Changes

After syncing:

```bash
# Check if hospitals loaded correctly
curl http://localhost:8001/api/hospitals

# Test nearby hospitals
curl "http://localhost:8001/api/hospitals/nearby?lat=43.7&lng=-79.7&limit=5"
```

## Auto-Sync on App Launch (Future Enhancement)

You can configure the app to automatically sync from GitHub on startup:
- Checks GitHub for updates every 24 hours
- Falls back to cached data if GitHub is unavailable
- No app updates needed to add/remove hospitals!

## Current Hospital Coverage

- **Toronto**: 5 hospitals
- **Brampton**: 2 hospitals  
- **Mississauga**: 2 hospitals
- **Ottawa**: 2 hospitals
- **Hamilton**: 1 hospital
- **London**: 1 hospital

**Total**: 13 hospitals

## Tips

1. **Always validate JSON** before pushing (use JSONLint.com)
2. **Double-check coordinates** (swap lat/lng is a common mistake)
3. **Keep IDs unique** and URL-friendly (lowercase, underscores)
4. **Test after changes** to ensure app works correctly
5. **Commit with descriptive messages** (e.g., "Added Oakville hospital")

## Need More Hospitals?

To expand coverage to other Ontario cities:
1. Research hospitals in that area
2. Add entries following the JSON structure
3. Sync the data
4. Test with postal codes from that area

The app will automatically show the nearest 5 hospitals based on user location!
