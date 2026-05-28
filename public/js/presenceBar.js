/**
 * Presence Bar Module
 * Client-side module for displaying and managing real-time presence indicators
 * Uses Firebase Realtime Database for user presence tracking
 */

class PresenceBar {
  constructor(options = {}) {
    this.MAX_VISIBLE = options.maxVisible || 7;
    this.HEARTBEAT_INTERVAL = options.heartbeatInterval || 60000; // 60 seconds
    this.avatarsEl = document.getElementById(options.avatarsElementId || 'auAvatars');
    this.overflowEl = document.getElementById(options.overflowElementId || 'auOverflow');
    this.moreBtn = document.getElementById(options.moreButtonId || 'auMoreBtn');
    this.moreCount = document.getElementById(options.moreCountId || 'auMoreCount');
    this.dropdown = document.getElementById(options.dropdownId || 'auDropdown');

    this.username = options.username || window.currentUsername;
    this.department = options.department || window.currentUserDept;
    this.role = options.role || window.currentUserRole;

    this.db = null;
    this.presenceRef = null;
    this.deptRef = null;
    this.firebaseReady = false;

    if (!this.avatarsEl) {
      console.warn('[PresenceBar] Required elements not found. Presence bar initialization skipped.');
      return;
    }

    this.init();
  }

  /**
   * Initialize Firebase connection and presence tracking
   */
  async init() {
    try {
      // Fetch Firebase config from server
      const response = await fetch('/api/user-activity/firebase-config');
      if (!response.ok) {
        console.warn('[PresenceBar] Firebase config not available');
        return;
      }

      const { config } = await response.json();
      if (!config.databaseURL) {
        console.warn('[PresenceBar] Firebase database URL not configured');
        return;
      }

      // Initialize Firebase
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      this.db = firebase.database();
      this.firebaseReady = true;

      // Set up presence
      this.setupPresence();

      // Listen to department presence
      this.listenToDepartmentPresence();

      // Setup UI event listeners
      this.setupEventListeners();

      console.log('[PresenceBar] Initialized successfully');
    } catch (error) {
      console.error('[PresenceBar] Initialization failed:', error);
    }
  }

  /**
   * Set up user presence in Firebase
   */
  setupPresence() {
    if (!this.db || !this.firebaseReady) return;

    this.presenceRef = this.db.ref(`presence/${this.department}/${this.username}`);

    this.currentStatus = 'online';
    this.lastActivityTime = Date.now();
    this.IDLE_TIME_LIMIT = 3 * 60 * 1000; // 3 minutes

    const resetIdleTimer = () => {
      this.lastActivityTime = Date.now();
      if (this.currentStatus === 'idle') {
        this.currentStatus = 'online';
        if (this.presenceRef) {
          this.presenceRef.update({
            status: 'online',
            ts: firebase.database.ServerValue.TIMESTAMP
          });
        }
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(ev => {
      document.addEventListener(ev, resetIdleTimer, { passive: true });
    });

    // Write presence data
    this.presenceRef.set({
      username: this.username,
      role: this.role,
      dept: this.department,
      status: 'online',
      ts: firebase.database.ServerValue.TIMESTAMP
    });

    // Remove presence on disconnect
    this.presenceRef.onDisconnect().remove();

    // Update heartbeat and check for idleness
    setInterval(() => {
      if (this.firebaseReady && this.presenceRef) {
        const idleDuration = Date.now() - this.lastActivityTime;
        if (idleDuration >= this.IDLE_TIME_LIMIT) {
          this.currentStatus = 'idle';
        }
        this.presenceRef.update({
          status: this.currentStatus,
          ts: firebase.database.ServerValue.TIMESTAMP
        });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Listen to department presence changes
   */
  listenToDepartmentPresence() {
    if (!this.db || !this.firebaseReady) return;

    this.deptRef = this.db.ref(`presence/${this.department}`);

    this.deptRef.on('value', (snap) => {
      const val = snap.val() || {};
      const peers = Object.values(val);

      this.renderPresenceBar(peers);
    });
  }

  /**
   * Render the presence bar with avatars
   */
  renderPresenceBar(peers) {
    if (!this.avatarsEl) return;

    this.avatarsEl.innerHTML = '';
    if (this.dropdown) this.dropdown.innerHTML = '';

    const visible = peers.slice(0, this.MAX_VISIBLE);
    const hidden = peers.slice(this.MAX_VISIBLE);

    // Render visible avatars
    visible.forEach((user) => {
      this.createAvatarElement(user, this.avatarsEl);
    });

    // Handle overflow
    if (hidden.length > 0) {
      if (this.moreCount) this.moreCount.textContent = `+${hidden.length}`;
      if (this.moreBtn) this.moreBtn.title = hidden.map((u) => u.username).join(', ');

      hidden.forEach((user) => {
        if (this.dropdown) {
          const item = document.createElement('div');
          item.className = 'au-dropdown-item';
          item.textContent = user.username;
          this.dropdown.appendChild(item);
        }
      });

      if (this.overflowEl) this.overflowEl.style.display = '';
    } else {
      if (this.overflowEl) this.overflowEl.style.display = 'none';
    }
  }

  /**
   * Create an avatar element for a user
   */
  createAvatarElement(user, container) {
    const av = document.createElement('div');
    av.className = 'au-avatar';
    av.textContent = user.username.charAt(0).toUpperCase();
    av.style.setProperty('--au-hue', this.stringToHue(user.username));

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'au-tooltip';

    const lastSeenTime = user.ts ? new Date(user.ts).toLocaleTimeString() : 'Just now';
    const statusLabel = user.status === 'on_break' ? 'On Break' : (user.status === 'idle' ? 'Idle' : 'Online');
    const statusColor =
      user.status === 'on_break' ? '#ffc107' : user.status === 'idle' ? '#dc3545' : '#28a745';

    tooltip.innerHTML = `
      <div class="aut-header">
        <span class="aut-dot" style="background-color: ${statusColor}"></span>
        <strong class="aut-name">${user.username}</strong>
      </div>
      <div class="aut-dept">🏢 ${user.dept || user.department || 'General'}</div>
      <div class="aut-role">🛡️ ${(user.role || 'user').toUpperCase()}</div>
      <div class="aut-status">Status: ${statusLabel}</div>
      <div class="aut-seen">Last Seen: ${lastSeenTime}</div>
    `;

    av.appendChild(tooltip);
    container.appendChild(av);
  }

  /**
   * Convert string to hue value for consistent color
   */
  stringToHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) % 360;
    }
    return h;
  }

  /**
   * Setup UI event listeners
   */
  setupEventListeners() {
    // Toggle dropdown on more button click
    if (this.moreBtn) {
      this.moreBtn.addEventListener('click', (e) => {
        if (this.dropdown) {
          this.dropdown.style.display = this.dropdown.style.display === 'none' ? 'block' : 'none';
        }
        e.stopPropagation();
      });
    }

    // Close dropdown on document click
    document.addEventListener('click', () => {
      if (this.dropdown) {
        this.dropdown.style.display = 'none';
      }
    });
  }

  /**
   * Update user status
   */
  updateStatus(newStatus) {
    if (this.presenceRef) {
      this.presenceRef.update({ status: newStatus });
    }
  }

  /**
   * Get current online users
   */
  getOnlineUsers(callback) {
    if (!this.deptRef) return;

    this.deptRef.once('value', (snap) => {
      const val = snap.val() || {};
      const peers = Object.values(val);
      if (callback) callback(peers);
    });
  }

  /**
   * Destroy presence (on logout)
   */
  destroy() {
    if (this.presenceRef) {
      this.presenceRef.remove();
    }
    if (this.deptRef) {
      this.deptRef.off();
    }
    this.firebaseReady = false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PresenceBar;
}
