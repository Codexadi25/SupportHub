/**
 * userActivityDashboard.js
 * Powers the live user-activity panel inside the Admin tab.
 * Uses the same Firebase RTDB configuration as the top-bar presence ribbon.
 */
document.addEventListener('DOMContentLoaded', () => {
  let allUsers = [];
  let filteredUsers = [];
  let enrolledUsers = [];
  let db = null;

  // DOM Elements
  const statusCounts = {
    online:      document.getElementById('count-online'),
    on_break:    document.getElementById('count-on-break'),
    unresponsive:document.getElementById('count-unresponsive'),
    unavailable: document.getElementById('count-unavailable'),
    idle:        document.getElementById('count-idle'),
    total:       document.getElementById('count-total')
  };

  const statusFilter       = document.getElementById('status-filter');
  const usersList          = document.getElementById('users-list');
  const filteredCount      = document.getElementById('filtered-count');
  const connectionIndicator= document.getElementById('connection-indicator');
  const refreshBtn         = document.getElementById('refresh-users');
  const goOnBreakBtn       = document.getElementById('go-on-break');
  const backOnlineBtn      = document.getElementById('back-online');

  // Guard — only run if the dashboard elements exist on this page
  if (!statusFilter || !usersList) return;

  const showToast = (m, t='success') => {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(m);
    const toast = document.createElement('div');
    toast.className = `toast ${t}`;
    toast.textContent = m;
    container.appendChild(toast);
    setTimeout(()=>{ toast.remove(); }, 3500);
  };

  init();

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    setupEventListeners();
    fetchEnrolledUsers().then(() => connectFirebase());
  }

  async function fetchEnrolledUsers() {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        enrolledUsers = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch enrolled users for dashboard:', e);
    }
  }

  function setupEventListeners() {
    statusFilter.addEventListener('change', applyFilter);
    refreshBtn?.addEventListener('click', async () => {
      await fetchEnrolledUsers();
      if (db) {
        db.ref('presence').once('value', snap => {
          const val = snap.val() || {};
          const allFbUsers = [];
          Object.keys(val).forEach(d => {
            const deptUsers = val[d] || {};
            Object.keys(deptUsers).forEach(u => {
              const userData = deptUsers[u] || {};
              allFbUsers.push({
                userId: userData.username,
                username: userData.username,
                role: userData.role || 'user',
                department: userData.dept || d || 'general',
                status: userData.status || 'online',
                lastActivity: userData.ts || Date.now()
              });
            });
          });
          updateUserList(allFbUsers);
          showToast('Dashboard stats and users successfully re-synced!', 'success');
        });
      } else {
        showToast('Real-time database synchronized!', 'success');
      }
    });
  }

  // ─── Firebase RTDB Connection ────────────────────────────────────────────────
  async function connectFirebase() {
    try {
      updateConnectionStatus('connecting');
      const cfgRes = await fetch('/api/user-activity/firebase-config');
      if (!cfgRes.ok) return updateConnectionStatus('disconnected');
      const { config } = await cfgRes.json();
      if (!config.databaseURL) return updateConnectionStatus('disconnected');

      if (!firebase.apps.length) firebase.initializeApp(config);
      db = firebase.database();
      updateConnectionStatus('connected');

      const username = window.currentUsername;
      const role = window.currentUserRole;
      const dept = window.currentUserDept;

      // Handle breaks and online status changes
      goOnBreakBtn?.addEventListener('click', () => {
        db.ref('presence/' + dept + '/' + username).update({ status: 'on_break', ts: firebase.database.ServerValue.TIMESTAMP });
        showToast('Status updated: On Break', 'info');
      });

      backOnlineBtn?.addEventListener('click', () => {
        db.ref('presence/' + dept + '/' + username).update({ status: 'online', ts: firebase.database.ServerValue.TIMESTAMP });
        showToast('Status updated: Online', 'success');
      });

      // Listen to presence list globally across all departments
      const presenceRef = db.ref('presence');
      presenceRef.on('value', snap => {
        const val = snap.val() || {};
        const allFbUsers = [];

        // Traverse presence/{department}/{username}
        Object.keys(val).forEach(d => {
          const deptUsers = val[d] || {};
          Object.keys(deptUsers).forEach(u => {
            const userData = deptUsers[u] || {};
            allFbUsers.push({
              userId: userData.username,
              username: userData.username,
              role: userData.role || 'user',
              department: userData.dept || d || 'general',
              status: userData.status || 'online',
              lastActivity: userData.ts || Date.now()
            });
          });
        });

        updateUserList(allFbUsers);
      });

    } catch (err) {
      console.error('Firebase Admin Presence Error:', err);
      updateConnectionStatus('disconnected');
    }
  }

  function updateConnectionStatus(status) {
    if (!connectionIndicator) return;
    const map = {
      connected:    '🟢 Live',
      connecting:   '🟡 Connecting…',
      disconnected: '🔴 Disconnected'
    };
    connectionIndicator.textContent = map[status] || '🔴 Disconnected';
    connectionIndicator.className = `status-indicator ${status}`;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────
  function mergeEnrolledAndPresence(fbPresences) {
    const isScoped = ['team_lead', 'quality_analyst', 'editor'].includes(window.currentUserRole);
    const currentUserDept = (window.currentUserDept || '').toLowerCase().trim();

    const fbMap = {};
    fbPresences.forEach(u => {
      fbMap[u.username.toLowerCase()] = u;
    });

    const merged = enrolledUsers.map(eu => {
      const active = fbMap[eu.username.toLowerCase()];
      if (active) {
        return {
          username: eu.username,
          role: eu.role || 'user',
          department: eu.department || 'general',
          status: active.status || 'online',
          lastActivity: active.lastActivity || Date.now()
        };
      } else {
        return {
          username: eu.username,
          role: eu.role || 'user',
          department: eu.department || 'general',
          status: 'unavailable',
          lastActivity: eu.updatedAt ? new Date(eu.updatedAt).getTime() : Date.now()
        };
      }
    });

    // Add active users not in the enrolled list (failsafe)
    fbPresences.forEach(p => {
      const exists = enrolledUsers.some(eu => eu.username.toLowerCase() === p.username.toLowerCase());
      if (!exists) {
        if (isScoped && p.department.toLowerCase().trim() !== currentUserDept) {
          return;
        }
        merged.push(p);
      }
    });

    return merged;
  }

  function updateUserList(users) {
    const merged = mergeEnrolledAndPresence(users);
    allUsers = merged;
    // Derive live counts
    const counts = { online: 0, on_break: 0, unresponsive: 0, unavailable: 0, idle: 0, total: 0 };
    merged.forEach(u => {
      const s = u.status || 'online';
      if (counts[s] !== undefined) counts[s]++;
      counts.total++;
    });
    updateStatusCounts(counts);
    applyFilter();
  }

  function updateStatusCounts(counts) {
    Object.keys(statusCounts).forEach(k => {
      if (statusCounts[k]) statusCounts[k].textContent = counts[k] ?? 0;
    });
  }

  function applyFilter() {
    const sel = statusFilter.value;
    filteredUsers = sel === 'all' ? allUsers : allUsers.filter(u => u.status === sel);
    renderUserList();
    if (filteredCount) filteredCount.textContent = filteredUsers.length;
  }

  function renderUserList() {
    if (!usersList) return;
    if (!filteredUsers.length) {
      usersList.innerHTML = '<div class="no-users"><p>No active users match this filter.</p></div>';
      return;
    }

    const roleOrder = { admin:6, vendor:5, team_lead:4, quality_analyst:3, editor:2, user:1, new:0 };
    const sorted = [...filteredUsers].sort((a, b) => {
      const aOn = a.status === 'online';
      const bOn = b.status === 'online';
      if (aOn !== bOn) return bOn - aOn;
      return (roleOrder[b.role] || 0) - (roleOrder[a.role] || 0);
    });

    usersList.innerHTML = sorted.map(u => {
      const statusClass = `status-${u.status || 'unavailable'}`;
      const isYou = u.username === window.currentUsername;
      const lastAct = u.lastActivity
        ? new Date(u.lastActivity).toLocaleTimeString()
        : '—';
      return `
        <div class="user-item${isYou ? ' is-you' : ''}">
          <div class="user-avatar" style="background:${avatarColor(u.username)};">
            ${(u.username || '?').charAt(0).toUpperCase()}
          </div>
          <div class="user-info">
            <div class="user-name">${esc(u.username)}${isYou ? ' <span class="you-badge">YOU</span>' : ''}</div>
            <div class="user-role">${(u.role || 'user').toUpperCase()} | ${esc(u.department.toUpperCase())}</div>
            <div class="last-activity">Last seen: ${lastAct}</div>
          </div>
          <div class="user-status ${statusClass}">
            <div class="status-dot"></div>
            <div class="status-text">${formatStatus(u.status)}</div>
          </div>
        </div>`;
    }).join('');
  }

  function formatStatus(s) {
    return { online:'Online', idle:'Idle', on_break:'On Break',
             unresponsive:'Unresponsive', unavailable:'Unavailable' }[s] || (s || 'Unknown');
  }

  function avatarColor(name) {
    const palette = ['#e91e63','#9c27b0','#3f51b5','#0288d1','#00897b','#388e3c','#f57c00','#5d4037','#546e7a'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
});