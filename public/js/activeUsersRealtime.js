document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('active-users-list');
  if (!listEl) return;

  const onlineIds = new Set();
  let snapshot = [];
  let ws = null;

  const IDLE_MS = 3 * 60 * 1000; // 3 minutes

  function connect() {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}`);

      ws.addEventListener('open', () => {
        try {
          ws.send(JSON.stringify({
            type: 'HELLO',
            user: {
              _id: window.currentUserId,
              id: window.currentUserId,
              username: window.currentUsername,
              role: window.currentUserRole
            }
          }));
        } catch(_) {}
      });

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ACTIVE_USERS') {
            onlineIds.clear();
            const users = Array.isArray(msg.payload) ? msg.payload : [];
            users.forEach(u => { if (u && u.userId) onlineIds.add(String(u.userId)); });
            renderRealtime(users);
            tick();
          }
        } catch(_) {}
      });

      ws.addEventListener('close', () => setTimeout(connect, 5000));
      ws.addEventListener('error', () => {});
    } catch(_) {}
  }

  connect();

  async function fetchUsers() {
    try {
      const res = await fetch('/api/active-users', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { location.href = '/login'; return []; }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function computeStatus(user) {
    const fromSocket = onlineIds.has(String(user.userId));
    if (fromSocket) return 'online';
    const last = typeof user.lastPingAt === 'string' ? Date.parse(user.lastPingAt) : user.lastPingAt;
    if (!last) return 'idle';
    return (Date.now() - last) < IDLE_MS ? 'online' : 'idle';
  }

  function updateCount(users) {
    const el = document.getElementById('active-users-count');
    if (!el) return;
    const online = users.filter(u => computeStatus(u) === 'online').length;
    const idle = users.length - online;
    el.textContent = `${online} online, ${idle} idle, ${users.length} total`;
  }

  function renderList(users) {
    if (!users.length) {
      listEl.innerHTML = '<div class="no-active-users"><p>No active users currently.</p></div>';
      updateCount([]);
      return;
    }

    const roleOrder = { admin: 6, editor: 5, vendor: 4, team_lead: 3, quality_analyst: 2, user: 1 };
    const sorted = users.slice().sort((a, b) => {
      const sa = computeStatus(a) === 'online';
      const sb = computeStatus(b) === 'online';
      if (sa !== sb) return sa ? -1 : 1;
      const ra = roleOrder[a.role] || 0;
      const rb = roleOrder[b.role] || 0;
      if (ra !== rb) return rb - ra;
      return String(a.username || '').localeCompare(String(b.username || ''));
    });

    listEl.innerHTML = sorted.map(u => {
      const status = computeStatus(u);
      const color = status === 'online' ? '#22c55e' : '#f59e0b';
      const lastSeen = u.lastPingAt ? new Date(u.lastPingAt).toLocaleTimeString() : 'Unknown';
      return `
        <div class="active-user-item ${status}">
          <div class="user-status">
            <span class="status-dot" style="background:${color};"></span>
            <span class="status-text">${status === 'online' ? 'Online' : 'Idle'}</span>
          </div>
          <div class="user-info">
            <div class="user-name">${u.username || 'User'}</div>
            <div class="user-role role-${u.role}">${String(u.role || '').toUpperCase()}</div>
          </div>
          <div class="user-meta">
            <small class="last-seen">Last seen: ${lastSeen}</small>
          </div>
        </div>`;
    }).join('');

    updateCount(users);
  }

  function renderRealtime(wsUsers) {
    if (!Array.isArray(wsUsers) || !wsUsers.length) return;
    renderList(wsUsers.map(u => ({
      userId: u.userId,
      username: u.username,
      role: u.role,
      lastPingAt: Date.now(),
      status: 'online'
    })));
  }

  async function tick() {
    snapshot = await fetchUsers();
    renderList(snapshot);
  }

  const refreshBtn = document.getElementById('refresh-active-users');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      tick().finally(() => { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh'; });
    });
  }

  fetch('/api/ping', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).finally(()=>{});
  tick();
  setInterval(tick, 30000);
});


