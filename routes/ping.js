const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { getOnlineUsers } = require('../utils/webSocketServer');
const firebaseService = require('../services/firebaseService');

const IDLE_THRESHOLD = 3 * 60 * 1000; // 3 minutes for idle status

// In-memory active users (by userId) and last seen
const activeUsers = new Map();

// --- NEW: Client Public IP Fetcher (Cached) ---
// This promise will hold the IP address once it's fetched.
let ipPromise = null;
const getUserPublicIP = () => {
    if (!ipPromise) {
        // Start the fetch only on the first call
        ipPromise = fetch('https://api.ipify.org?format=json')
            .then(res => {
                if (!res.ok) throw new Error('IP API failed');
                return res.json();
            })
            .then(data => {
                console.log('User Public IP fetched:', data.ip);
                return data.ip;
            })
            .catch(err => {
                console.warn('Could not fetch user public IP:', err.message);
                return 'unknown'; // Return 'unknown' on failure
            });
    }
    return ipPromise; // Return the promise
};
// GET /api/ping
// Touches session to extend cookie and tracks active users
router.get('/ping', (req, res) => {
  if (!req.session) return res.status(200).json({ ok: true });

  try {
    // extend expiry
    if (typeof req.session.touch === 'function') req.session.touch();
    const now = Date.now();
    req.session._lastPingAt = now;

    // Track active users (expires if no ping within 5 minutes)
    const user = req.session.user;
    if (user && user._id) {
      const userId = String(user._id);
      activeUsers.set(userId, {
        userId: userId,
        username: user.username,
        role: user.role,
        lastPingAt: now,
        status: 'online'
      });

      // Sync status to Firebase
      firebaseService.updateUserStatus(user.username, user.department || 'general', 'online').catch(err => {
        console.warn('[Ping] Firebase status sync failed:', err.message);
      });
    }
  } catch (err) {
    console.error('Ping handler error:', err);
  }

  return res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    heartbeat: true 
  });
});

// POST /api/heartbeat
// Enhanced heartbeat endpoint for better reliability
router.post('/heartbeat', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Not authenticated' 
    });
  }

  try {
    const now = Date.now();
    const user = req.session.user;
    const userId = String(user._id);
    
    // Update session
    if (typeof req.session.touch === 'function') req.session.touch();
    req.session._lastPingAt = now;
    
    // Update tracking
    activeUsers.set(userId, {
      userId: userId,
      username: user.username,
      role: user.role,
      lastPingAt: now,
      status: 'online'
    });

    // Sync status to Firebase
    firebaseService.updateUserStatus(user.username, user.department || 'general', 'online').catch(err => {
      console.warn('[Heartbeat] Firebase status sync failed:', err.message);
    });
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      userId: userId,
      status: 'online'
    });
    
  } catch (err) {
    console.error('Heartbeat handler error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /api/active-users (returns users with status based on last 3 min)
// Made this endpoint more lenient - doesn't require strict authentication
router.get('/active-users', (req, res) => {
  try {
    const cutoff = Date.now() - IDLE_THRESHOLD;
    const byId = new Map();

    // include socket-online users as online
    try {
      const socketUsers = getOnlineUsers ? getOnlineUsers() : [];
      socketUsers.forEach(u => {
        if (!u || !u.userId) return;
        byId.set(String(u.userId), { 
          userId: String(u.userId), 
          username: u.username, 
          role: u.role, 
          lastPingAt: Date.now(), 
          lastActivity: u.lastActivity,
          status: u.status || 'online' 
        });
      });
    } catch(err) {
      console.error('Error getting socket users:', err);
    }

    // merge ping-tracked users
    activeUsers.forEach((u, k) => {
      const id = String(u.userId);
      const isOnline = u.lastPingAt >= cutoff || byId.has(id);
      const existing = byId.get(id);
      if (existing) {
        // keep online status; update lastPingAt if newer
        existing.lastPingAt = Math.max(existing.lastPingAt || 0, u.lastPingAt || 0);
        byId.set(id, existing);
      } else {
        byId.set(id, { ...u, status: isOnline ? 'online' : 'idle' });
      }
    });

    // ensure requester is shown (helps first-load UX) - only if authenticated
    try {
      const me = req.session?.user;
      if (me && me._id) {
        const id = String(me._id);
        if (!byId.has(id)) {
          byId.set(id, { 
            userId: id, 
            username: me.username, 
            role: me.role, 
            lastPingAt: Date.now(), 
            lastActivity: Date.now(),
            status: 'online' 
          });
        }
      }
    } catch(err) {
      console.error('Error adding requester:', err);
    }

    res.json(Array.from(byId.values()));
  } catch (error) {
    console.error('Error in /api/active-users:', error);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});

module.exports = router;