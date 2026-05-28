# Firebase Service Account Setup Guide

## Overview

The SupportHub presence tracking system uses Firebase Admin SDK, which requires a **Firebase Service Account Key** file for server-side operations.

This is different from the web SDK credentials (FIREBASE_API_KEY, etc.) already configured in your `.env` file.

## Step-by-Step Setup

### 1. Get Your Firebase Service Account Key

1. Go to **[Firebase Console](https://console.firebase.google.com/)**
2. Select your project: **`supporthubgit-25655784-dacc0`**
3. Click the **Gear Icon** (Project Settings) → **Service Accounts**
4. Click **Generate New Private Key** button
5. A JSON file will download automatically (e.g., `supporthubgit-25655784-dacc0-xxxxx.json`)

### 2. Save the Key File

**Option A: Save directly to config folder (Recommended)**

```bash
# Copy the downloaded JSON file to:
d:\Lab\SupportHub\config\firebase-key.json
```

**Option B: Set environment variable path**

Update `.env` with custom path:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/your/firebase-key.json
```

### 3. Verify Setup

Your `firebase-key.json` should look like:

```json
{
  "type": "service_account",
  "project_id": "supporthubgit-25655784-dacc0",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

### 4. Update `.gitignore` (Security)

**IMPORTANT:** Never commit this file to Git!

Add to `.gitignore`:

```gitignore
# Firebase service account (security sensitive)
config/firebase-key.json
firebase-key.json
*.firebase-key.json
```

### 5. Restart Application

```bash
# Kill running server and restart
npm start
# or
npm run dev
```

You should see:

```
[Firebase] Admin SDK initialized successfully
```

## .env Verification

Ensure your `.env` has all Firebase credentials:

```env
# Firebase Realtime Database (Web SDK - already configured)
FIREBASE_API_KEY=AIzaSyC2XtfZ8Z5YPgT3kM-j1Bkbo83i_37OVn0
FIREBASE_AUTH_DOMAIN=supporthubgit-25655784-dacc0.firebaseapp.com
FIREBASE_DATABASE_URL=https://supporthubgit-25655784-dacc0-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_PROJECT_ID=supporthubgit-25655784-dacc0
FIREBASE_STORAGE_BUCKET=supporthubgit-25655784-dacc0.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=787754082784
FIREBASE_APP_ID=1:787754082784:web:751f958cf9e3e4e625cb85

# Firebase Admin SDK Service Account Path
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-key.json
```

## Troubleshooting

### Error: "ENOENT: no such file or directory, open 'firebase-key.json'"

**Solution**: Ensure the JSON file is in the correct location and path is correct in `.env`.

```bash
# Check if file exists
ls config/firebase-key.json
```

### Error: "Firebase not initialized"

**Solution**: The service account key file is missing or invalid. Check logs for detailed error message.

```bash
# View console logs
npm run dev
# Look for [Firebase] messages
```

### Presence Features Not Working

**Solution**: Firebase initialization failed gracefully. This is OK for development, but fix it for production:

1. Download service account key from Firebase Console
2. Save to `config/firebase-key.json`
3. Restart the app

## Firebase Rules (Optional)

If you want to secure your Firebase Realtime Database, add these rules in Firebase Console:

```json
{
  "rules": {
    "presence": {
      "$department": {
        "$username": {
          ".read": "root.child('presence').hasChild($department)",
          ".write": "$username == auth.token.username"
        }
      }
    }
  }
}
```

## What Happens Without Service Account Key

If the service account key is missing:

- ✅ App starts normally
- ✅ MongoDB operations work
- ✅ User login/logout work
- ❌ Firebase presence tracking disabled
- ❌ Real-time user activity dashboard won't update

## Production Deployment

For production (Heroku, Azure, etc.):

1. Set `FIREBASE_SERVICE_ACCOUNT_PATH` to the JSON file path
2. Or set environment variables directly:

```bash
# In CI/CD or deployment platform
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

Then update `firebaseService.js` line 13 to parse from env:

```javascript
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  // ... use file path
}
```

---

**Questions?** Check `/PRESENCE_SYSTEM_DOCS.md` for more details.
