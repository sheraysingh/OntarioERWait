# Quick Setup Guide - GitHub Hospital List Integration

## Step 1: Upload hospitals.json to Your GitHub Repo

1. Go to: https://github.com/sheraysingh/OntarioERWait
2. Click "Add file" → "Upload files"
3. Upload `/app/hospitals.json` from this project
4. Commit to the `main` branch

## Step 2: Verify the File is Accessible

The raw URL should be:
```
https://raw.githubusercontent.com/sheraysingh/OntarioERWait/main/hospitals.json
```

Test in browser - you should see the JSON content.

## Step 3: Sync the Data

Run this command to pull from GitHub:
```bash
curl -X POST http://localhost:8001/api/hospitals/sync
```

You should see:
```json
{
  "message": "Successfully synced 13 hospitals",
  "timestamp": "2025-01-22T16:30:00.000000"
}
```

## Step 4: Verify It Worked

Check the hospitals loaded:
```bash
curl http://localhost:8001/api/hospitals | jq
```

## How to Update Hospitals in the Future

1. Edit `hospitals.json` on GitHub
2. Commit the changes
3. Run sync command: `curl -X POST http://localhost:8001/api/hospitals/sync`
4. App immediately shows updated data!

## The System is Already Configured!

✅ Backend `.env` points to: `https://raw.githubusercontent.com/sheraysingh/OntarioERWait/main/hospitals.json`
✅ Sync endpoint ready: `POST /api/hospitals/sync`
✅ Falls back to local file if GitHub unavailable

## Current Setup

- **Source**: Your GitHub repo (https://github.com/sheraysingh/OntarioERWait)
- **File**: hospitals.json
- **Branch**: main
- **Hospitals**: 13 Ontario hospitals with wait time URLs

Just upload the file and you're done! 🚀
