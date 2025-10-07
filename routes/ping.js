const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { getOnlineUsers } = require('../utils/webSocketServer');

const ROTATE_INTERVAL = 3 * 60 * 1000; // 3 minutes

// in-memory active users (by userId) and last seen
const activeUsers = new Map();

// GET /api/ping
// Touches session to extend cookie, rotates session, and tracks active users.
router.get('/ping', isAuthenticated, (req, res) => {
  if (!req.session) return res.status(200).json({ ok: true });

  try {
    // extend expiry
    if (typeof req.session.touch === 'function') req.session.touch();
    const now = Date.now();
    req.session._lastPingAt = now;

    // Track active users (expires if no ping within 4 minutes)
    const user = req.session.user;
    if (user && user._id) {
      activeUsers.set(String(user._id), {
        userId: String(user._id),
        username: user.username,
        role: user.role,
        lastPingAt: now
      });
    }
  } catch (err) {
    console.error('Ping handler error:', err);
  }

  return res.json({ ok: true });
});

// GET /api/active-users (returns users with status based on last 4 min)
router.get('/active-users', isAuthenticated, (req, res) => {
  const cutoff = Date.now() - (4 * 60 * 1000);
  const byId = new Map();

  // include socket-online users as online
  try {
    const socketUsers = getOnlineUsers ? getOnlineUsers() : [];
    socketUsers.forEach(u => {
      if (!u || !u.userId) return;
      byId.set(String(u.userId), { userId: String(u.userId), username: u.username, role: u.role, lastPingAt: Date.now(), status: 'online' });
    });
  } catch(_) {}

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

  // ensure requester is shown (helps first-load UX)
  try {
    const me = req.session?.user;
    if (me && me._id) {
      const id = String(me._id);
      if (!byId.has(id)) {
        byId.set(id, { userId: id, username: me.username, role: me.role, lastPingAt: Date.now(), status: 'online' });
      }
    }
  } catch(_) {}

  res.json(Array.from(byId.values()));
});

module.exports = router;