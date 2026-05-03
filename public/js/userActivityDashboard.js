/**
 * userActivityDashboard.js
 * Powers the live user-activity panel inside the Admin tab.
 * Reuses window.__globalWS (opened by main.js for ALL users) when available,
 * so there is only one WebSocket connection per page.
 */
document.addEventListener('DOMContentLoaded', () => {
  let ws = null;
  let allUsers = [];
  let filteredUsers = [];
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  let reconnectTimeout = null;

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

  init();

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    setupEventListeners();
    connectWebSocket();
    loadInitialData();
  }

  function setupEventListeners() {
    statusFilter.addEventListener('change', applyFilter);
    refreshBtn?.addEventListener('click', refreshData);
    goOnBreakBtn?.addEventListener('click', () => sendStatus('on_break'));
    backOnlineBtn?.addEventListener('click', () => sendStatus('online'));
  }

  // ─── WebSocket ───────────────────────────────────────────────────────────────
  function connectWebSocket() {
    // Reuse the global WS opened in main.js IIFE (window.__globalWS) to avoid
    // a second HELLO handshake. If it doesn't exist yet, open a fresh one.
    const existing = window.__globalWS;
    if (existing && existing.readyState === WebSocket.OPEN) {
      ws = existing;
      updateConnectionStatus('connected');
      ws.addEventListener('message', handleMessage);
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      updateConnectionStatus('disconnected');
      return;
    }

    try {
      updateConnectionStatus('connecting');
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}`);

      ws.addEventListener('open', () => {
        reconnectAttempts = 0;
        updateConnectionStatus('connected');
        window.__globalWS = ws;
        // Send HELLO if main.js hasn't done it yet
        if (window.currentUserId && window.currentUsername && window.currentUserRole) {
          ws.send(JSON.stringify({
            type: 'HELLO',
            user: {
              _id: window.currentUserId,
              username: window.currentUsername,
              role: window.currentUserRole
            }
          }));
        }
      });

      ws.addEventListener('message', handleMessage);

      ws.addEventListener('close', (event) => {
        updateConnectionStatus('disconnected');
        window.__globalWS = null;
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000);
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connectWebSocket, delay);
        }
      });

      ws.addEventListener('error', () => { updateConnectionStatus('disconnected'); });
    } catch (err) {
      updateConnectionStatus('disconnected');
      console.error('Failed to create WebSocket connection:', err);
    }
  }

  function handleMessage(e) {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'USER_LIST_UPDATE') {
        updateUserList(msg.users || []);
      } else if (msg.type === 'BROADCAST_UPDATE') {
        // Refresh counts on any broadcast (e.g., a new note was created)
        loadInitialData();
      }
    } catch (err) {
      console.error('Error parsing WS message:', err);
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

  function sendStatus(status) {
    const sock = ws || window.__globalWS;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: 'SET_STATUS', status }));
    } else {
      console.warn('WebSocket not connected — cannot set status');
    }
  }

  // ─── Data Loading ────────────────────────────────────────────────────────────
  async function loadInitialData() {
    try {
      const [usersRes, countsRes] = await Promise.all([
        fetch('/api/user-activity',        { credentials: 'same-origin' }),
        fetch('/api/user-activity/counts', { credentials: 'same-origin' })
      ]);

      if (usersRes.ok) {
        const { data } = await usersRes.json();
        updateUserList(data || []);
      }
      if (countsRes.ok) {
        const { data } = await countsRes.json();
        updateStatusCounts(data || {});
      }
    } catch (err) {
      console.error('Error loading activity data:', err);
    }
  }

  async function refreshData() {
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing…'; }
    try { await loadInitialData(); }
    catch (err) { console.error('Refresh failed:', err); }
    finally {
      if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh'; }
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────
  function updateUserList(users) {
    allUsers = users;
    // Derive counts from the live list as a quick fallback
    const counts = users.reduce((acc, u) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      acc.total     = (acc.total     || 0) + 1;
      return acc;
    }, {});
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
      usersList.innerHTML = '<div class="no-users"><p>No users match this filter.</p></div>';
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
      const isYou = u.userId === window.currentUserId;
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
            <div class="user-role">${(u.role || 'user').toUpperCase()}</div>
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

  // ─── Auto-refresh fallback ───────────────────────────────────────────────────
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) loadInitialData();
  }, 30000);

  window.addEventListener('beforeunload', () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  });
});