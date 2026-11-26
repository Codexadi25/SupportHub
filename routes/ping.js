const express = require('express');
const router = express.Router();
const { isAuthenticated, isNotNew } = require('../middleware/authMiddleware');
const { getOnlineUsers } = require('../utils/webSocketServer');
const firebaseService = require('../services/firebaseService');
const User = require('../models/User');

const IDLE_THRESHOLD = 3 * 60 * 1000; // 3 minutes for idle status
const ACTIVE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes window for active users

// In-memory active users (by userId) and last seen
const activeUsers = new Map();

// In-memory cache for DB users to minimize MongoDB load
let cachedDbUsers = [];
let lastDbUsersFetch = 0;
const DB_USERS_CACHE_TTL = 60 * 1000; // 60s cache

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
// Touches session to extend cookie and tracks active users.
// Also serves as the zero-downtime live health check for CI/CD and Render deploys without forcing login.
router.get('/ping', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), authenticated: false });
  }

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
    heartbeat: true,
    user: req.session && req.session.user ? {
      _id: req.session.user._id,
      username: req.session.user.username,
      role: req.session.user.role,
      department: req.session.user.department,
      lob: req.session.user.department
    } : null
  });
});

// POST /api/heartbeat
// Enhanced heartbeat endpoint for better reliability
router.post('/heartbeat', isAuthenticated, (req, res) => {
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

// GET /api/active-users (returns users with status based on real activity)
// Made this endpoint lenient - doesn't require strict authentication
router.get('/active-users', async (req, res) => {
  try {
    const cutoff = Date.now() - IDLE_THRESHOLD;
    const byId = new Map();

    // 1. Fetch recent active users with in-memory caching to eliminate MongoDB load
    try {
      const now = Date.now();
      if (now - lastDbUsersFetch > DB_USERS_CACHE_TTL) {
        const recentWindow = new Date(now - ACTIVE_THRESHOLD_MS);
        cachedDbUsers = await User.find({
          $or: [
            { lastActiveAt: { $gte: recentWindow } },
            { updatedAt: { $gte: recentWindow } }
          ],
          role: { $ne: 'new' }
        }).select('_id username role department displayName profileName image profilePic bgColor lastActiveAt').lean();
        lastDbUsersFetch = now;
      }

      cachedDbUsers.forEach(u => {
        const id = String(u._id);
        const lastActiveMs = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : Date.now();
        const isOnline = (Date.now() - lastActiveMs) < IDLE_THRESHOLD;
        byId.set(id, {
          userId: id,
          username: u.username,
          displayName: u.displayName || u.profileName || u.username,
          role: u.role || 'user',
          department: u.department || 'general',
          profilePic: u.profilePic || u.image || '',
          image: u.image || u.profilePic || '',
          bgColor: u.bgColor || '',
          lastPingAt: lastActiveMs,
          status: isOnline ? 'online' : 'idle'
        });
      });
    } catch (dbErr) {
      console.warn('Error fetching active users from DB:', dbErr.message);
    }

    // 2. include socket-online users as online
    try {
      const socketUsers = getOnlineUsers ? getOnlineUsers() : [];
      socketUsers.forEach(u => {
        if (!u || !u.userId) return;
        const id = String(u.userId);
        const existing = byId.get(id) || {};
        byId.set(id, {
          ...existing,
          userId: id,
          username: u.username || existing.username,
          displayName: u.displayName || existing.displayName || u.username,
          role: u.role || existing.role || 'user',
          department: u.department || existing.department || 'general',
          profilePic: u.profilePic || existing.profilePic || '',
          image: u.image || existing.image || '',
          bgColor: u.bgColor || existing.bgColor || '',
          lastPingAt: Date.now(),
          status: 'online'
        });
      });
    } catch(err) {
      console.error('Error getting socket users:', err);
    }

    // 3. merge ping-tracked users
    activeUsers.forEach((u, k) => {
      const id = String(u.userId);
      const isOnline = u.lastPingAt >= cutoff || byId.has(id);
      const existing = byId.get(id) || {};
      byId.set(id, {
        ...existing,
        ...u,
        lastPingAt: Math.max(existing.lastPingAt || 0, u.lastPingAt || 0),
        status: isOnline ? 'online' : 'idle'
      });
    });

    // 4. ensure requester is shown (helps first-load UX)
    try {
      const me = req.session?.user;
      if (me && (me._id || me.id)) {
        const id = String(me._id || me.id);
        const existing = byId.get(id) || {};
        byId.set(id, {
          ...existing,
          userId: id,
          username: me.username,
          displayName: me.displayName || me.profileName || me.username,
          role: me.role,
          department: me.department || 'general',
          profilePic: me.profilePic || me.image || '',
          image: me.image || me.profilePic || '',
          bgColor: me.bgColor || '',
          lastPingAt: Date.now(),
          status: 'online'
        });
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


// GET /api/extension/check-update
// Server-driven silent auto-updater mapping
router.get('/extension/check-update', (req, res) => {
  try {
    const clientVersion = req.query.version || '1.0';
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const manifestPath = path.join(__dirname, '../public/extension/manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.json({ success: false, message: 'Manifest not found on server' });
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const serverVersion = manifest.version || '1.0';
    
    if (clientVersion !== serverVersion) {
      console.log(`[Auto-Update] Version mismatch: Client is ${clientVersion}, Server is ${serverVersion}. Updating...`);
      
      const targetDir = path.join(os.homedir(), 'SupportHub-Extension');
      const sourceDir = path.join(__dirname, '../public/extension');
      
      let copied = false;
      if (fs.existsSync(targetDir) && fs.existsSync(sourceDir)) {
        const copyRecursive = (src, dest) => {
          const exists = fs.existsSync(src);
          const stats = exists && fs.statSync(src);
          const isDirectory = exists && stats.isDirectory();
          if (isDirectory) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
            fs.readdirSync(src).forEach((childItemName) => {
              copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
            });
          } else {
            fs.copyFileSync(src, dest);
          }
        };
        
        copyRecursive(sourceDir, targetDir);
        console.log('[Auto-Update] Successfully copied new extension version to user directory.');
        copied = true;
      }
      return res.json({ success: true, updated: true, newVersion: serverVersion, copied });
    }
    
    res.json({ success: true, updated: false });
  } catch (err) {
    console.error('[Auto-Update Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/extension/train-sentence
// Receives a custom typed sentence, checks if it is different from existing templates,
// and saves it under the "Trained Predictions" category for this LOB.
router.post('/extension/train-sentence', async (req, res) => {
  try {
    const Category = require('../models/Category');
    const { sentence, lob } = req.body;
    
    if (!sentence || !sentence.trim()) {
      return res.status(400).json({ success: false, message: 'Sentence text is required' });
    }
    
    const cleanSentence = sentence.trim();
    const cleanLob = (lob || 'zomato').toLowerCase().trim();

    // 1. Find all categories and templates for this LOB to check if the sentence already exists
    const categories = await Category.find({ lob: cleanLob });
    let exists = false;
    
    for (const cat of categories) {
      for (const tpl of cat.templates) {
        if (tpl.text.toLowerCase().trim() === cleanSentence.toLowerCase()) {
          exists = true;
          break;
        }
      }
      if (exists) break;
    }

    if (exists) {
      return res.json({ success: true, message: 'Sentence already exists in templates database', newlyTrained: false });
    }

    // 2. Add to "Trained Predictions" category
    let category = await Category.findOne({ title: 'Trained Predictions', lob: cleanLob });
    if (!category) {
      category = await Category.create({ title: 'Trained Predictions', lob: cleanLob });
    }

    const now = new Date();
    category.templates.push({
      text: cleanSentence,
      tags: ['trained_prediction'],
      isAi: true,
      meta: {
        createdAt: now,
        updatedAt: now
      }
    });

    await category.save();
    console.log(`[AI Learning] Successfully trained new sentence for LOB "${cleanLob}": "${cleanSentence}"`);

    return res.json({ success: true, message: 'New sentence trained successfully', newlyTrained: true });
  } catch (err) {
    console.error('[AI Learning Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;