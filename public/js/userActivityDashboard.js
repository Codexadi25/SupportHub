/**
 * userActivityDashboard.js
 * Powers the live user-activity panel inside the Admin tab.
 * 
 * Features:
 * - Fetches user data from MongoDB via /api/user-activity/department-users
 * - Combines with real-time Firebase presence status
 * - Displays live user activity with status filters
 * - Allows users to change their status (online/on-break)
 * - Real-time updates via Firebase Realtime Database
 */

document.addEventListener('DOMContentLoaded', () => {
  let allUsers = [];
  let filteredUsers = [];
  let db = null;
  let presenceRef = null;
  let userPresenceRef = null;

  // DOM Elements
  const statusCounts = {
    online: document.getElementById('count-online'),
    on_break: document.getElementById('count-on-break'),
    unresponsive: document.getElementById('count-unresponsive'),
    unavailable: document.getElementById('count-unavailable'),
    idle: document.getElementById('count-idle'),
    total: document.getElementById('count-total')
  };

  const statusFilter = document.getElementById('status-filter');
  const usersList = document.getElementById('users-list');
  const filteredCount = document.getElementById('filtered-count');
  const connectionIndicator = document.getElementById('connection-indicator');
  const refreshBtn = document.getElementById('refresh-users');
  const goOnBreakBtn = document.getElementById('go-on-break');
  const backOnlineBtn = document.getElementById('back-online');

  // Guard — only run if the dashboard elements exist on this page
  if (!statusFilter || !usersList) return;

  const showToast = (m, t = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(m);
    const toast = document.createElement('div');
    toast.className = `toast ${t}`;
    toast.textContent = m;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  };

  init();

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    setupEventListeners();
    initializeFirebase().then(() => {
      startRealtimeSync();
    });
  }
  // ─── Initialize Firebase ─────────────────────────────────────────────────────
  async function initializeFirebase() {
    try {
      updateConnectionStatus('connecting');

      const cfgRes = await fetch('/api/user-activity/firebase-config');
      if (!cfgRes.ok) {
        updateConnectionStatus('disconnected');
        return;
      }

      const { config } = await cfgRes.json();
      if (!config.databaseURL) {
        updateConnectionStatus('disconnected');
        return;
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      db = firebase.database();
      updateConnectionStatus('connected');

      console.log('[Dashboard] Firebase initialized');
    } catch (error) {
      console.error('[Dashboard] Firebase init error:', error);
      updateConnectionStatus('disconnected');
    }
  }

  // ─── Start Real-time Sync ────────────────────────────────────────────────────
  function startRealtimeSync() {
    if (!db) return;

    const username = window.currentUsername;
    const department = (window.currentUserDept || 'general').toLowerCase();

    // Fetch initial MongoDB user list combined with Firebase presence
    fetchAndMergeUsers().catch(err => {
      console.error('[Dashboard] Initial fetch failed:', err);
    });

    // Listen to presence changes in real-time
    presenceRef = db.ref('presence');
    presenceRef.on('value', snap => {
      const val = snap.val() || {};
      console.log('[Dashboard] Presence data updated from Firebase');
      fetchAndMergeUsers().catch(err => {
        console.error('[Dashboard] Merge failed on presence update:', err);
      });
    });

    // Set up user status control handlers
    goOnBreakBtn?.addEventListener('click', () => {
      if (db && username && department) {
        db.ref(`presence/${department}/${username}`).update({
          status: 'on_break',
          ts: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Status updated: On Break', 'info');
      }
    });

    backOnlineBtn?.addEventListener('click', () => {
      if (db && username && department) {
        db.ref(`presence/${department}/${username}`).update({
          status: 'online',
          ts: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Status updated: Online', 'success');
      }
    });
  }

  // ─── Fetch and Merge MongoDB + Firebase Data ─────────────────────────────────
  async function fetchAndMergeUsers() {
    try {
      // Fetch users from MongoDB via API
      const res = await fetch('/api/user-activity/department-users');
      if (!res.ok) {
        console.warn('[Dashboard] Failed to fetch users:', res.status);
        return;
      }

      const data = await res.json();
      if (!data.success) {
        console.warn('[Dashboard] API returned error:', data.message);
        return;
      }

      const users = data.users || [];

      // Transform MongoDB user data
      const transformed = users.map(u => ({
        username: u.username,
        role: u.role,
        department: u.department || 'general',
        status: u.status || 'offline', // From Firebase
        lastActivity: u.lastUpdated || Date.now(),
        userId: u._id
      }));

      updateUserList(transformed);
    } catch (error) {
      console.error('[Dashboard] Fetch/merge error:', error);
    }
  }

  // ─── Setup Event Listeners ────────────────────────────────────────────────────
  function setupEventListeners() {
    statusFilter.addEventListener('change', applyFilter);

    refreshBtn?.addEventListener('click', async () => {
      showToast('Refreshing user data...', 'info');
      await fetchAndMergeUsers();
      showToast('Dashboard refreshed!', 'success');
    });
  }

  // ─── Connection Status ────────────────────────────────────────────────────────
  function updateConnectionStatus(status) {
    if (!connectionIndicator) return;
    const map = {
      connected: '🟢 Live',
      connecting: '🟡 Connecting…',
      disconnected: '🔴 Disconnected'
    };
    connectionIndicator.textContent = map[status] || '🔴 Disconnected';
    connectionIndicator.className = `status-indicator ${status}`;
  }

  // ─── Update User List ────────────────────────────────────────────────────────
  function updateUserList(users) {
    allUsers = users;

    // Calculate status counts
    const counts = {
      online: 0,
      on_break: 0,
      unresponsive: 0,
      unavailable: 0,
      idle: 0,
      total: 0
    };

    allUsers.forEach(u => {
      const status = u.status || 'offline';
      if (status === 'offline') {
        counts.unavailable++;
      } else if (counts[status] !== undefined) {
        counts[status]++;
      }
      counts.total++;
    });

    updateStatusCounts(counts);
    applyFilter();
  }

  // ─── Update Status Counts ────────────────────────────────────────────────────
  function updateStatusCounts(counts) {
    Object.keys(statusCounts).forEach(k => {
      if (statusCounts[k]) {
        statusCounts[k].textContent = counts[k] ?? 0;
      }
    });
  }

  // ─── Apply Filter ────────────────────────────────────────────────────────────
  function applyFilter() {
    const selectedStatus = statusFilter.value;
    
    if (selectedStatus === 'all') {
      filteredUsers = [...allUsers];
    } else if (selectedStatus === 'unavailable') {
      // Show offline users
      filteredUsers = allUsers.filter(u => u.status === 'offline' || u.status === 'unavailable');
    } else {
      filteredUsers = allUsers.filter(u => u.status === selectedStatus);
    }

    renderUserList();
    if (filteredCount) {
      filteredCount.textContent = filteredUsers.length;
    }
  }

  // ─── Render User List ────────────────────────────────────────────────────────
  function renderUserList() {
    if (!usersList) return;

    if (!filteredUsers.length) {
      usersList.innerHTML = '<div class="no-users"><p>No active users match this filter.</p></div>';
      return;
    }

    // Sort: online users first, then by role
    const roleOrder = { admin: 6, vendor: 5, team_lead: 4, quality_analyst: 3, editor: 2, user: 1, new: 0 };
    const sorted = [...filteredUsers].sort((a, b) => {
      // Online users first
      const aOnline = a.status === 'online' ? 1 : 0;
      const bOnline = b.status === 'online' ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;

      // Then by role
      const aRoleRank = roleOrder[a.role] || 0;
      const bRoleRank = roleOrder[b.role] || 0;
      return bRoleRank - aRoleRank;
    });

    usersList.innerHTML = sorted
      .map(u => {
        const statusClass = `status-${u.status || 'unavailable'}`;
        const isYou = u.username === window.currentUsername;
        const lastActivity = u.lastActivity ? new Date(u.lastActivity).toLocaleTimeString() : '—';

        return `
          <div class="user-item${isYou ? ' is-you' : ''}">
            <div class="user-avatar" style="background:${getAvatarColor(u.username)};">
              ${(u.username || '?').charAt(0).toUpperCase()}
            </div>
            <div class="user-info">
              <div class="user-name">
                ${escapeHtml(u.username)}${isYou ? ' <span class="you-badge">YOU</span>' : ''}
              </div>
              <div class="user-role">
                ${(u.role || 'user').toUpperCase()} | ${escapeHtml(u.department.toUpperCase())}
              </div>
              <div class="last-activity">Last seen: ${lastActivity}</div>
            </div>
            <div class="user-status ${statusClass}">
              <div class="status-dot"></div>
              <div class="status-text">${formatStatus(u.status)}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ─── Utility Functions ───────────────────────────────────────────────────────
  function formatStatus(status) {
    const statusMap = {
      online: 'Online',
      idle: 'Idle',
      on_break: 'On Break',
      unresponsive: 'Unresponsive',
      unavailable: 'Unavailable',
      offline: 'Unavailable'
    };
    return statusMap[status] || (status || 'Unknown');
  }

  function getAvatarColor(name) {
    const palette = ['#e91e63', '#9c27b0', '#3f51b5', '#0288d1', '#00897b', '#388e3c', '#f57c00', '#5d4037', '#546e7a'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});