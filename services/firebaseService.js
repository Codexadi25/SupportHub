/**
 * Firebase Service
 * Handles all Firebase Realtime Database operations for presence tracking
 * and user activity management
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let dbInstance = null;
let isInitialized = false;

/**
 * Initialize Firebase Admin SDK
 * Should be called once during app startup
 * @param {Object|string} serviceAccountKey - Service account key object or path to JSON file
 */
const initializeFirebase = (serviceAccountKey) => {
  try {
    if (!serviceAccountKey) {
      console.warn('[Firebase] No service account key provided. Firebase disabled.');
      return null;
    }

    let credential;

    // Handle string path
    if (typeof serviceAccountKey === 'string') {
      const keyPath = path.resolve(serviceAccountKey);
      if (!fs.existsSync(keyPath)) {
        console.warn(`[Firebase] Service account key not found at: ${keyPath}`);
        return null;
      }
      credential = admin.credential.cert(require(keyPath));
    } else {
      // Handle object
      credential = admin.credential.cert(serviceAccountKey);
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: credential,
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }

    dbInstance = admin.database();
    isInitialized = true;
    console.log('[Firebase] Admin SDK initialized successfully');
    return dbInstance;
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error.message);
    isInitialized = false;
    return null;
  }
};

/**
 * Get Firebase Database instance
 */
const getDatabase = () => {
  if (!isInitialized || !dbInstance) {
    return null;
  }
  return dbInstance;
};

/**
 * Sync user data to Firebase RTDB
 * Called during login to populate user presence data
 * @param {Object} user - User object from MongoDB
 * @param {string} department - User's department
 */
const syncUserToFirebase = async (user) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. User sync skipped.');
      return null;
    }

    const department = (user.department || 'general').toLowerCase();
    
    const userData = {
      username: user.username,
      userId: user._id.toString(),
      role: user.role,
      department: department,
      status: 'online',
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
      createdAt: admin.database.ServerValue.TIMESTAMP
    };

    // Store in presence/department/username structure
    await db.ref(`presence/${department}/${user.username}`).set(userData);
    
    console.log(`[Firebase] User synced to Firebase: ${user.username} (${department})`);
    return userData;
  } catch (error) {
    console.error('[Firebase] Error syncing user to Firebase:', error.message);
    throw error;
  }
};

/**
 * Get all users for a specific department
 * Used for populating the activity dashboard
 * @param {string} department - Department name
 */
const getDepartmentUsers = async (department) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. Returning empty user list.');
      return [];
    }

    const dept = (department || 'general').toLowerCase();
    
    const snapshot = await db.ref(`presence/${dept}`).once('value');
    const data = snapshot.val() || {};
    
    return Object.values(data);
  } catch (error) {
    console.error('[Firebase] Error fetching department users:', error.message);
    return [];
  }
};

/**
 * Update user status in Firebase
 * @param {string} username - Username
 * @param {string} department - Department
 * @param {string} status - New status (online, idle, on_break, unavailable)
 */
const updateUserStatus = async (username, department, status) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. Status update skipped.');
      return false;
    }

    const dept = (department || 'general').toLowerCase();
    
    await db.ref(`presence/${dept}/${username}`).update({
      status: status,
      lastUpdated: admin.database.ServerValue.TIMESTAMP
    });
    
    console.log(`[Firebase] User status updated: ${username} -> ${status}`);
    return true;
  } catch (error) {
    console.error('[Firebase] Error updating user status:', error.message);
    throw error;
  }
};

/**
 * Remove user from presence on logout
 * @param {string} username - Username
 * @param {string} department - Department
 */
const removeUserPresence = async (username, department) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. Presence removal skipped.');
      return false;
    }

    const dept = (department || 'general').toLowerCase();
    
    await db.ref(`presence/${dept}/${username}`).remove();
    console.log(`[Firebase] User removed from presence: ${username}`);
    return true;
  } catch (error) {
    console.error('[Firebase] Error removing user presence:', error.message);
    // Don't throw, just log silently
  }
};

/**
 * Fetch all users from MongoDB and sync to Firebase
 * Used for bulk operations or scheduled syncs
 * @param {Model} UserModel - Mongoose User model
 */
const syncAllUsersToFirebase = async (UserModel) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. Bulk sync skipped.');
      return 0;
    }

    const users = await UserModel.find({});
    
    let syncCount = 0;
    for (const user of users) {
      if (user.role !== 'new') {
        const department = (user.department || 'general').toLowerCase();
        const userData = {
          username: user.username,
          userId: user._id.toString(),
          role: user.role,
          department: department,
          status: 'offline',
          lastUpdated: admin.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`presence/${department}/${user.username}`).set(userData);
        syncCount++;
      }
    }
    
    console.log(`[Firebase] Synced ${syncCount} users to Firebase`);
    return syncCount;
  } catch (error) {
    console.error('[Firebase] Error bulk syncing users:', error.message);
    throw error;
  }
};

/**
 * Get user activity stats for a department
 * @param {string} department - Department name
 */
const getUserActivityStats = async (department) => {
  try {
    const db = getDatabase();
    if (!db) {
      return { online: 0, on_break: 0, idle: 0, unresponsive: 0, unavailable: 0, total: 0 };
    }

    const dept = (department || 'general').toLowerCase();
    
    const users = await getDepartmentUsers(dept);
    
    const stats = {
      online: users.filter(u => u.status === 'online').length,
      on_break: users.filter(u => u.status === 'on_break').length,
      idle: users.filter(u => u.status === 'idle').length,
      unresponsive: users.filter(u => u.status === 'unresponsive').length,
      unavailable: users.filter(u => u.status === 'unavailable').length,
      total: users.length
    };
    
    return stats;
  } catch (error) {
    console.error('[Firebase] Error fetching activity stats:', error.message);
    return { online: 0, on_break: 0, idle: 0, unresponsive: 0, unavailable: 0, total: 0 };
  }
};

/**
 * Clear all presence data for a department (admin function)
 * @param {string} department - Department name
 */
const clearDepartmentPresence = async (department) => {
  try {
    const db = getDatabase();
    if (!db) {
      console.warn('[Firebase] Firebase not initialized. Clear skipped.');
      return false;
    }

    const dept = (department || 'general').toLowerCase();
    
    await db.ref(`presence/${dept}`).remove();
    console.log(`[Firebase] Cleared presence for department: ${dept}`);
    return true;
  } catch (error) {
    console.error('[Firebase] Error clearing department presence:', error.message);
    throw error;
  }
};

module.exports = {
  initializeFirebase,
  getDatabase,
  syncUserToFirebase,
  getDepartmentUsers,
  updateUserStatus,
  removeUserPresence,
  syncAllUsersToFirebase,
  getUserActivityStats,
  clearDepartmentPresence
};
