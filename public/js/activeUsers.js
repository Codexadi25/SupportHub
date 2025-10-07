document.addEventListener('DOMContentLoaded', () => {
  const activeUsersList = document.getElementById('active-users-list');
  if (!activeUsersList) return;

  const onlineIds = new Set();
  let lastSnapshot = [];

  // WebSocket presence
  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}`);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'HELLO', user: { _id: window.currentUserId || window.currentUserid || window.currentUserID, id: window.currentUserId, username: window.currentUsername, role: window.currentUserRole } }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ACTIVE_USERS') {
          onlineIds.clear();
          const wsUsers = Array.isArray(msg.payload) ? msg.payload : [];
          wsUsers.forEach(u => {
            if (u && u.userId) onlineIds.add(String(u.userId));
          });
          // Render immediately using realtime payload (all online)
          renderRealtime(wsUsers);
          // Also refresh snapshot to include idle statuses
          tick();
        }
      } catch(_) {}
    });
  } catch(_) {}

  async function fetchActiveUsers() {
    try {
      const res = await fetch('/api/active-users', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return []; }
      const users = await res.json();
      return Array.isArray(users) ? users : [];
    } catch {
      return [];
    }
  }

  async function render() {
    const users = lastSnapshot;
    activeUsersList.innerHTML = users.length ? users.map(u => {
      const isOnline = onlineIds.has(String(u.userId)) || (u.status === 'online');
      const dotColor = isOnline ? '#22c55e' : '#f59e0b';
      return `
        <div class="active-user-item">
          <span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;"></span>
          <strong>${u.username}</strong> <span class="user-role role-${u.role}">${(u.role||'').toUpperCase()}</span>
        </div>
      `;
    }).join('') : '<p>No active users now.</p>';
  }

  function renderRealtime(wsUsers) {
    if (!Array.isArray(wsUsers)) return;
    // Prefer ws realtime list when available (all online)
    activeUsersList.innerHTML = wsUsers.length ? wsUsers.map(u => `
      <div class="active-user-item">
        <span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;"></span>
        <strong>${u.username}</strong> <span class="user-role role-${u.role}">${(u.role||'').toUpperCase()}</span>
      </div>
    `).join('') : '<p>No active users now.</p>';
  }

  async function tick() {
    lastSnapshot = await fetchActiveUsers();
    render();
  }

  // seed presence fast
  fetch('/api/ping', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).finally(()=>{});
  tick();
  setInterval(tick, 30000);
});


