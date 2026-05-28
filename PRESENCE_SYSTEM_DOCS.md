# Modular Presence Tracking System - Documentation

## Overview

The SupportHub application now uses a **modular presence tracking system** that combines MongoDB user data with Firebase Realtime Database for real-time user activity monitoring.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│         Client-side (Browser)                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  presenceBar.js (Class-based Module)             │  │
│  │  - Handles UI rendering of avatars               │  │
│  │  - Real-time Firebase connection                 │  │
│  │  - Presence heartbeat (60s interval)             │  │
│  │  - Status updates (online/on_break/idle)         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  userActivityDashboard.js (Admin Tab)            │  │
│  │  - Fetches MongoDB user data via API             │  │
│  │  - Merges with Firebase presence status          │  │
│  │  - Renders real-time activity list               │  │
│  │  - Status filtering & sorting                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
         ↓                                      ↓
┌─────────────────────────────────────────────────────────┐
│         Server-side (Node.js/Express)                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  firebaseService.js (Service Layer)              │  │
│  │  - Initialize Firebase Admin SDK                 │  │
│  │  - Sync users from MongoDB to Firebase           │  │
│  │  - Get department users with presence status     │  │
│  │  - Update user status                            │  │
│  │  - Remove user presence on logout                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  authController.js (Updated)                    │  │
│  │  - loginUser: Syncs user to Firebase on login   │  │
│  │  - logoutUser: Removes from Firebase on logout  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  routes/api/userActivity.js (API Endpoints)      │  │
│  │  - GET /api/user-activity/firebase-config       │  │
│  │  - GET /api/user-activity/department-users      │  │
│  │  - GET /api/user-activity/stats                 │  │
│  │  - GET /api/user-activity/all-departments       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  User Model (MongoDB)                            │  │
│  │  - username, role, department, etc.              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
         ↓                                      ↓
┌─────────────────────────────────────────────────────────┐
│         Data Sources                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  MongoDB                                          │  │
│  │  - Persistent user data storage                  │  │
│  │  - User roles, departments, metadata             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Firebase Realtime Database                      │  │
│  │  - Real-time presence tracking                   │  │
│  │  Structure: presence/{department}/{username}    │  │
│  │  - status (online/on_break/idle/offline)         │  │
│  │  - lastUpdated timestamp                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### User Login
```
1. User submits login form
   ↓
2. authController.loginUser() validates credentials
   ↓
3. Session is created with user data
   ↓
4. firebaseService.syncUserToFirebase(user) is called (non-blocking)
   ↓
5. User data is stored in Firebase at:
   presence/{department}/{username}
   {
     username: "john.doe",
     userId: "507f1f77bcf86cd799439011",
     role: "agent",
     department: "zomato",
     status: "online",
     lastUpdated: <server-timestamp>,
     createdAt: <server-timestamp>
   }
   ↓
6. User is redirected to dashboard
   ↓
7. Client-side presenceBar.js initializes
   ↓
8. presenceBar listens to Firebase changes
   ↓
9. All connected clients see the user go online
```

### User Activity Dashboard
```
1. User navigates to Admin → Logger tab
   ↓
2. userActivityDashboard.js initializes
   ↓
3. Fetches /api/user-activity/department-users
   ↓
4. API fetches from MongoDB + Firebase:
   - MongoDB: Get all users in department
   - Firebase: Get presence status for each user
   ↓
5. Data is merged and sorted
   ↓
6. Dashboard renders with live status indicators
   ↓
7. Firebase listeners update in real-time
   ↓
8. User can change status (online/on-break)
```

### User Logout
```
1. User clicks logout
   ↓
2. authController.logoutUser() is triggered
   ↓
3. firebaseService.removeUserPresence() is called
   ↓
4. User is removed from Firebase at:
   presence/{department}/{username}
   ↓
5. Session is destroyed
   ↓
6. User is redirected to login
   ↓
7. All connected clients see user go offline
```

## Files Modified/Created

### New Files

1. **`services/firebaseService.js`** (NEW)
   - Central service for Firebase operations
   - Exports functions for user sync, status updates, etc.
   - Handles Firebase Admin SDK initialization

2. **`public/js/presenceBar.js`** (NEW)
   - Client-side module for presence bar
   - Class-based architecture: `PresenceBar` class
   - Handles real-time avatar rendering
   - Manages heartbeat and status updates

### Modified Files

3. **`controllers/authController.js`**
   - Added Firebase service import
   - `loginUser()`: Now calls `syncUserToFirebase()`
   - `logoutUser()`: Now calls `removeUserPresence()`

4. **`views/index.ejs`**
   - Removed inline Firebase presence code (60+ lines)
   - Replaced with modular `PresenceBar` instantiation
   - Added script reference to `presenceBar.js`

5. **`public/js/userActivityDashboard.js`**
   - Updated to use new API endpoints
   - Fetches from MongoDB + Firebase
   - Real-time sync with Firebase presence
   - Better error handling and logging

6. **`routes/api/userActivity.js`**
   - Added 3 new endpoints:
     - `GET /api/user-activity/department-users`
     - `GET /api/user-activity/stats`
     - `GET /api/user-activity/all-departments`
   - Combines MongoDB + Firebase data

## Configuration

### Environment Variables Required

Add these to your `.env` file:

```env
# Firebase Admin SDK
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK Service Account
# Create a service account in Firebase Console
# Download the JSON key and set path or content
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-key.json
```

### Initialize Firebase in app.js

Add this at the start of your `app.js`:

```javascript
// Initialize Firebase Admin SDK
const firebaseService = require('./services/firebaseService');
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

try {
  firebaseService.initializeFirebase(serviceAccount);
  console.log('[Firebase] Admin SDK initialized successfully');
} catch (error) {
  console.warn('[Firebase] Admin SDK initialization failed (non-critical):', error.message);
}
```

## Usage

### For Developers

#### Using PresenceBar in a view

```ejs
<!-- Include Firebase CDN -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>

<!-- Your HTML elements -->
<div id="auAvatars"></div>
<div id="auOverflow" style="display:none;">
  <div id="auMoreBtn" class="au-more">+<span id="auMoreCount">0</span></div>
  <div id="auDropdown" class="au-dropdown"></div>
</div>

<!-- Initialize -->
<script src="/js/presenceBar.js"></script>
<script>
  const presenceBar = new PresenceBar({
    username: window.currentUsername,
    department: window.currentUserDept,
    role: window.currentUserRole,
    avatarsElementId: 'auAvatars',
    overflowElementId: 'auOverflow',
    moreButtonId: 'auMoreBtn',
    moreCountId: 'auMoreCount',
    dropdownId: 'auDropdown'
  });
</script>
```

#### Using firebaseService in code

```javascript
const { syncUserToFirebase, updateUserStatus, getDepartmentUsers } = require('./services/firebaseService');

// Sync user to Firebase
await syncUserToFirebase(user);

// Update user status
await updateUserStatus('john.doe', 'zomato', 'on_break');

// Get all users in department
const users = await getDepartmentUsers('zomato');
```

## Status Values

Valid status values in Firebase:

- `online` - User is actively working
- `on_break` - User is on break
- `idle` - User is idle (not active for a while)
- `unresponsive` - User is not responding
- `unavailable` - User is not online
- `offline` - User has logged out

## API Endpoints

### 1. Get Firebase Config
```
GET /api/user-activity/firebase-config
Authentication: Required (session)
Response:
{
  "success": true,
  "config": {
    "apiKey": "...",
    "authDomain": "...",
    "databaseURL": "...",
    ...
  }
}
```

### 2. Get Department Users
```
GET /api/user-activity/department-users
Authentication: Required (admin/vendor/team_lead/quality_analyst/editor)
Response:
{
  "success": true,
  "department": "zomato",
  "users": [
    {
      "_id": "...",
      "username": "john.doe",
      "role": "agent",
      "department": "zomato",
      "status": "online",
      "lastUpdated": 1234567890,
      "online": true
    }
  ],
  "count": 5
}
```

### 3. Get Activity Stats
```
GET /api/user-activity/stats
Authentication: Required
Response:
{
  "success": true,
  "department": "zomato",
  "stats": {
    "online": 8,
    "on_break": 2,
    "idle": 1,
    "unresponsive": 0,
    "unavailable": 3,
    "total": 14
  }
}
```

### 4. Get All Departments (Admin Only)
```
GET /api/user-activity/all-departments
Authentication: Required (admin only)
Response:
{
  "success": true,
  "departments": {
    "zomato": [...],
    "blinkit": [...],
    ...
  },
  "totalUsers": 50
}
```

## Performance Considerations

### Database Queries
- ✅ Firebase Realtime Database is optimized for frequent small updates
- ✅ MongoDB is queried on-demand via API endpoints
- ✅ Avoid frequent full database scans

### Client-side
- ✅ PresenceBar uses efficient DOM manipulation
- ✅ Only visible avatars are rendered (first 7, rest in dropdown)
- ✅ Heartbeat interval: 60 seconds (configurable)

### Network
- ✅ Firebase listeners are persistent (one connection per client)
- ✅ API endpoints are paginated (implement if >1000 users)
- ✅ Consider implementing connection pooling for MongoDB

## Troubleshooting

### Firebase Connection Issues
```javascript
// Check Firebase initialization
if (!firebase.apps.length) {
  console.error('Firebase not initialized');
}

// Check database URL
console.log(db.ref().toString());
```

### Presence Not Updating
```javascript
// Verify presence data structure
db.ref('presence/zomato').once('value', snap => {
  console.log(snap.val());
});
```

### Users Not Appearing in Dashboard
1. Check user has correct role (not 'new')
2. Verify user department matches current user
3. Check if user data is synced to Firebase during login

## Future Enhancements

1. **Pagination**: Implement pagination for >1000 users
2. **Filtering**: Add advanced filters (by role, department, etc.)
3. **Analytics**: Track user activity patterns
4. **Notifications**: Push notifications for status changes
5. **Bulk Operations**: Sync all users on app startup
6. **Caching**: Cache Firebase data with TTL
7. **Offline Support**: Service worker for offline presence

## Support & Maintenance

- **Logs**: Check console for `[Firebase]` and `[Dashboard]` prefixed logs
- **Monitoring**: Monitor Firebase RTDB read/write counts
- **Scaling**: Plan for additional Firebase nodes if >10k concurrent users
- **Security**: Implement Firebase Rules for permission control

---

**Last Updated**: May 28, 2026
**Maintained by**: Development Team
**Version**: 1.0 (Modular Presence System)
