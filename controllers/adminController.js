const Category = require('../models/Category');
const Log = require('../models/Log');
const User = require('../models/User');
const { broadcastUpdate } = require('../utils/webSocketServer');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Bulk upload Cands from JSON file with options to append or replace
 * POST /api/admin/bulk-upload-cands
 * Body: { mode: 'append' | 'replace' } (default: 'append')
 */
exports.bulkUploadCands = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('JSON file is required');
  }

  let jsonData;
  try {
    jsonData = JSON.parse(req.file.buffer.toString());
  } catch (err) {
    res.status(400);
    throw new Error('Invalid JSON file');
  }

  if (!jsonData.categories || !Array.isArray(jsonData.categories)) {
    res.status(400);
    throw new Error('JSON must contain a "categories" array');
  }

  const mode = req.body.mode || 'append'; // Default to append mode
  let message = '';

  if (mode === 'replace') {
    // Replace mode: Delete all existing data and insert new data
    await Category.deleteMany({});
    await Category.insertMany(jsonData.categories);
    message = 'Canned responses have been replaced with new data from file.';
  } else {
    // Append mode: Add new data without deleting existing data
    const existingCount = await Category.countDocuments();
    const newCount = jsonData.categories.length;
    
    // Insert new categories, ignoring duplicates based on title
    const insertedCategories = [];
    for (const category of jsonData.categories) {
      try {
        const newCategory = await Category.create(category);
        insertedCategories.push(newCategory);
      } catch (error) {
        // If category already exists (duplicate title), skip it
        if (error.code === 11000) {
          console.log(`Skipping duplicate category: ${category.title}`);
        } else {
          throw error;
        }
      }
    }
    
    message = `Appended ${insertedCategories.length} new canned responses. ${existingCount} existing responses preserved.`;
  }

  broadcastUpdate({ message });

  res.status(200).json({ 
    message: 'Bulk upload completed successfully.',
    details: message,
    mode: mode
  });
});

/**
 * GET /api/admin/logs
 */
exports.getLogs = asyncHandler(async (req, res) => {
  const { level, severity, limit = 100 } = req.query;

  const q = {};
  if (level && level !== 'all') q.level = level;
  if (severity) q.severity = severity;

  const logs = await Log.find(q).sort({ createdAt: -1 }).limit(parseInt(limit, 10));
  res.status(200).json(logs);
});

/**
 * GET /api/admin/users
 */
exports.getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password').sort({ username: 1 });
  res.status(200).json(users);
});

/**
 * PUT /api/admin/users/:id/role
 */
exports.updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body || {};
  const userId = req.params.id;

  if (!['new','user','editor','team_lead','quality_analyst','vendor','admin'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // prevent demoting last admin
  if (user.role === 'admin' && role !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      res.status(400);
      throw new Error('Cannot remove the last admin');
    }
  }

  const before = { role: user.role };
  user.role = role;
  await user.save();

  if (Logger && Logger.logDatabaseChange) {
    await Logger.logDatabaseChange('UPDATE', 'User', userId, before, { role }, req.session?.user?.id, req.session?.user?.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      description: 'Admin changed user role'
    });
  }

  res.status(200).json({ message: 'Role updated' });
});

/**
 * DELETE /api/admin/users/:id
 */
exports.deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  // prevent admin deleting self
  const requester = req.session && req.session.user;
  if (requester && requester._id && requester._id.toString() === userId.toString()) {
    res.status(400);
    throw new Error('You cannot delete your own account');
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // prevent deleting last admin
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      res.status(400);
      throw new Error('Cannot delete the last admin');
    }
  }

  await User.deleteOne({ _id: userId });

  if (Logger && Logger.logDatabaseChange) {
    await Logger.logDatabaseChange('DELETE', 'User', userId, { username: user.username }, null, req.session?.user?.id, req.session?.user?.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      description: 'Admin deleted user'
    });
  }

  res.status(200).json({ message: 'User deleted' });
});

/**
 * POST /api/admin/cleanup-logs
 * optional body: { days: 30, limit: 100 }
 */
exports.cleanupLogs = asyncHandler(async (req, res) => {
  const days = parseInt(req.body?.days || 30, 10);
  const limit = parseInt(req.body?.limit || 100, 10);

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // delete logs older than cutoff first
  await Log.deleteMany({ createdAt: { $lt: cutoff } });
  // ensure only last `limit` remain, delete older beyond the limit
  const total = await Log.countDocuments();
  if (total > limit) {
    const toRemove = total - limit;
    const oldLogs = await Log.find({}).sort({ createdAt: 1 }).limit(toRemove);
    const ids = oldLogs.map(l => l._id);
    await Log.deleteMany({ _id: { $in: ids } });
  }

  res.status(200).json({ message: 'Logs cleaned up' });
});

/**
 * PUT /api/admin/users/:id/password
 * Body: { newPassword }
 */
exports.updateUserPassword = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body || {};

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters long.');
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(newPassword, salt);
  const before = { password: '***' };
  user.password = hashed;
  await user.save();

  if (Logger && Logger.logDatabaseChange) {
    await Logger.logDatabaseChange('UPDATE', 'User', userId, before, { password: '***' }, req.session?.user?.id, req.session?.user?.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      description: 'Admin set new user password'
    });
  }

  res.status(200).json({ message: 'Password updated' });
});

/**
 * POST /api/admin/users/:id/reset-password
 * returns: { tempPassword }
 */
exports.resetUserPassword = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // generate a temporary password (12 chars, URL-safe)
  const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(tempPassword, salt);

  const before = { password: '***' };
  user.password = hashed;
  await user.save();

  if (Logger && Logger.logDatabaseChange) {
    await Logger.logDatabaseChange('UPDATE', 'User', userId, before, { password: '***' }, req.session?.user?.id, req.session?.user?.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      description: 'Admin reset user password'
    });
  }

  // return temporary password once (admin should copy/save it)
  res.status(200).json({ message: 'Password reset', tempPassword });
});

/**
 * POST /api/admin/users/bulk
 * Body: { usernames: [ 'a', 'b' ] } OR form textlines (handled in client)
 * returns createdUsers: [{ username, password, _id }]
 */
exports.bulkCreateUsers = asyncHandler(async (req, res) => {
  const list = req.body?.usernames || req.body?.usernamesText;
  let usernames = [];

  if (Array.isArray(list)) {
    usernames = list.map(u => String(u).trim()).filter(Boolean);
  } else if (typeof list === 'string') {
    usernames = String(list).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } else if (req.body?.usernamesTextArea) {
    usernames = String(req.body.usernamesTextArea).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  if (!usernames.length) {
    res.status(400);
    throw new Error('No usernames provided');
  }

  const createdUsers = [];
  for (const usernameRaw of usernames) {
    const username = usernameRaw.toLowerCase();
    const exists = await User.findOne({ username });
    if (exists) continue;
    const tempPassword = username; // initial password = username (client suggests changing)
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(tempPassword, salt);
    const u = new User({ userId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'), username, password: hashed });
    await u.save();
    createdUsers.push({ _id: u._id, username: u.username, password: tempPassword });
  }

  res.status(200).json({ createdUsers });
});