document.addEventListener('DOMContentLoaded', () => {
  let ws = null;
  let allUsers = [];
  let filteredUsers = [];
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;
  let reconnectTimeout = null;

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

  // Initialize
  init();

  function init() {
    setupEventListeners();
    connectWebSocket();
    loadInitialData();
  }

  function setupEventListeners() {
    statusFilter.addEventListener('change', applyFilter);
    refreshBtn.addEventListener('click', refreshData);
    goOnBreakBtn.addEventListener('click', () => setUserStatus('on_break'));
    backOnlineBtn.addEventListener('click', () => setUserStatus('online'));
  }

  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached. Using AJAX fallback.');
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
        console.log('WebSocket connected');
        
        // Send user identification
        console.log('Window user data:', {
          userId: window.currentUserId,
          username: window.currentUsername,
          role: window.currentUserRole
        });
        
        if (window.currentUserId && window.currentUsername && window.currentUserRole) {
          console.log('Sending user identification to WebSocket:', {
            _id: window.currentUserId,
            username: window.currentUsername,
            role: window.currentUserRole
          });
          ws.send(JSON.stringify({
            type: 'HELLO',
            user: {
              _id: window.currentUserId,
              username: window.currentUsername,
              role: window.currentUserRole
            }
          }));
        } else {
          console.warn('Missing user data for WebSocket identification:', {
            userId: window.currentUserId,
            username: window.currentUsername,
            role: window.currentUserRole
          });
        }
      });

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          
          if (msg.type === 'USER_LIST_UPDATE') {
            console.log('Received user list update with', msg.users?.length || 0, 'users:', msg.users);
            updateUserList(msg.users || []);
          } else if (msg.type === 'WELCOME') {
            console.log('WebSocket welcome:', msg.message);
          } else if (msg.type === 'ERROR') {
            console.error('WebSocket error:', msg.message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.addEventListener('close', (event) => {
        updateConnectionStatus('disconnected');
        
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`WebSocket disconnected. Reconnecting in ${delay/1000}s...`);
          
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
          }
          reconnectTimeout = setTimeout(connectWebSocket, delay);
        }
      });
      
      ws.addEventListener('error', (error) => {
        updateConnectionStatus('disconnected');
        console.error('WebSocket error:', error);
      });
    } catch (error) {
      updateConnectionStatus('disconnected');
      console.error('Failed to create WebSocket connection:', error);
    }
  }

  function updateConnectionStatus(status) {
    const statusText = {
      'connected': '🟢 Connected',
      'connecting': '🟡 Connecting...',
      'disconnected': '🔴 Disconnected'
    };
    
    connectionIndicator.textContent = statusText[status] || '🔴 Disconnected';
    connectionIndicator.className = `status-indicator ${status}`;
  }

  async function loadInitialData() {
    try {
      const [usersResponse, countsResponse] = await Promise.all([
        fetch('/api/user-activity', { credentials: 'same-origin' }),
        fetch('/api/user-activity/counts', { credentials: 'same-origin' })
      ]);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        console.log('Initial data loaded:', usersData.data?.length || 0, 'users');
        updateUserList(usersData.data || []);
      }

      if (countsResponse.ok) {
        const countsData = await countsResponse.json();
        updateStatusCounts(countsData.data || {});
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  async function refreshData() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    try {
      await loadInitialData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  }

  function updateUserList(users) {
    allUsers = users;
    console.log('Updating user list with', users.length, 'users');
    applyFilter();
  }

  function updateStatusCounts(counts) {
    Object.keys(statusCounts).forEach(status => {
      if (statusCounts[status]) {
        statusCounts[status].textContent = counts[status] || 0;
      }
    });
  }

  function applyFilter() {
    const selectedStatus = statusFilter.value;
    
    if (selectedStatus === 'all') {
      filteredUsers = allUsers;
    } else {
      filteredUsers = allUsers.filter(user => user.status === selectedStatus);
    }
    
    renderUserList();
    updateFilteredCount();
  }

  function renderUserList() {
    if (filteredUsers.length === 0) {
      usersList.innerHTML = '<div class="no-users"><p>No users found</p></div>';
      return;
    }

    // Sort users: online first, then by role, then by name
    const roleOrder = { admin: 6, editor: 5, vendor: 4, team_lead: 3, quality_analyst: 2, user: 1 };
    const sortedUsers = filteredUsers.sort((a, b) => {
      const aOnline = a.status === 'online';
      const bOnline = b.status === 'online';
      if (aOnline !== bOnline) return bOnline - aOnline;
      
      const aRole = roleOrder[a.role] || 0;
      const bRole = roleOrder[b.role] || 0;
      if (aRole !== bRole) return bRole - aRole;
      
      return a.username.localeCompare(b.username);
    });

    usersList.innerHTML = sortedUsers.map(user => {
      const statusClass = `status-${user.status}`;
      const lastActivity = user.lastActivity ? 
        new Date(user.lastActivity).toLocaleTimeString() : 
        'Unknown';
      
      return `
        <div class="user-item">
          <div class="user-avatar">
            ${user.username.charAt(0).toUpperCase()}
          </div>
          <div class="user-info">
            <div class="user-name">${user.username}</div>
            <div class="user-role">${user.role.toUpperCase()}</div>
            <div class="last-activity">Last activity: ${lastActivity}</div>
          </div>
          <div class="user-status ${statusClass}">
            <div class="status-dot"></div>
            <div class="status-text">${formatStatusText(user.status)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatStatusText(status) {
    const statusMap = {
      'online': 'Online',
      'idle': 'Idle',
      'on_break': 'On Break',
      'unresponsive': 'Unresponsive',
      'unavailable': 'Unavailable'
    };
    return statusMap[status] || status;
  }

  function updateFilteredCount() {
    filteredCount.textContent = filteredUsers.length;
  }

  function setUserStatus(status) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'SET_STATUS',
        status: status
      }));
    } else {
      console.warn('WebSocket not connected. Cannot set status.');
    }
  }

  // Activity tracking
  function trackActivity() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ACTIVITY',
        timestamp: Date.now()
      }));
    }
  }

  // Track user activity
  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  let lastActivityTime = 0;
  const ACTIVITY_THROTTLE = 5000; // 5 seconds

  activityEvents.forEach(event => {
    document.addEventListener(event, () => {
      const now = Date.now();
      if (now - lastActivityTime > ACTIVITY_THROTTLE) {
        lastActivityTime = now;
        trackActivity();
      }
    }, { passive: true });
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Page unload');
    }
  });

  // Fallback refresh every 60 seconds
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      loadInitialData();
    }
  }, 60000);
});
