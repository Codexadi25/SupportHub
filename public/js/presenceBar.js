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
    this.updateLiveStatus('pending');
    try {
      // Fetch Firebase config from server
      const response = await fetch('/api/user-activity/firebase-config');
      if (!response.ok) {
        console.warn('[PresenceBar] Firebase config not available');
        this.updateLiveStatus('pending');
        return;
      }

      const { config } = await response.json();
      if (!config.databaseURL) {
        console.warn('[PresenceBar] Firebase database URL not configured — running in local mode');
        // Still populate the You chip and show a sensible status
        this.updateYouChip();
        this.updateLiveStatus('localonly');
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

      // console.log('[PresenceBar] Initialized successfully');
    } catch (error) {
      console.error('[PresenceBar] Initialization failed:', error);
      this.updateLiveStatus('offline');
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
      profilePic: window.currentUserProfilePic || '',
      image: window.currentUserProfilePic || '',
      status: 'online',
      ts: firebase.database.ServerValue.TIMESTAMP,
      profileName: window.currentUserProfileName || '',
      displayName: window.currentUserDisplayName || '',
      bgColor: window.currentUserBgColor || ''
    });

    // Remove presence on disconnect
    this.presenceRef.onDisconnect().remove();

    // Connection state monitoring
    const connectedRef = this.db.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      const isConnected = snap.val() === true;
      this.updateLiveStatus(isConnected ? 'online' : 'offline');
    });

    // Populate "You" chip if it exists
    this.updateYouChip();

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
   * Listen to global presence changes across all departments (Google Docs Style)
   */
  listenToDepartmentPresence() {
    if (!this.db || !this.firebaseReady) return;

    // Listen to root presence to see everyone across all departments
    this.deptRef = this.db.ref('presence');

    this.deptRef.on('value', (snap) => {
      const val = snap.val() || {};
      const peers = [];

      // Flatten the department-keyed structures
      Object.keys(val).forEach(deptKey => {
        const deptData = val[deptKey];
        if (deptData && typeof deptData === 'object') {
          Object.values(deptData).forEach(user => {
            if (user && user.username) {
              peers.push(user);
            }
          });
        }
      });

      // Premium sorting: current user first, then online, then on_break, then idle
      const statusOrder = { online: 3, on_break: 2, idle: 1 };
      const sortedPeers = peers.sort((a, b) => {
        const aIsYou = a.username === this.username ? 1 : 0;
        const bIsYou = b.username === this.username ? 1 : 0;
        if (aIsYou !== bIsYou) return bIsYou - aIsYou;

        const aOrder = statusOrder[a.status] || 0;
        const bOrder = statusOrder[b.status] || 0;
        if (aOrder !== bOrder) return bOrder - aOrder;

        return a.username.localeCompare(b.username);
      });

      this.renderPresenceBar(sortedPeers);
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
    visible.forEach((user, i) => {
      this.createAvatarElement(user, this.avatarsEl, i);
    });

    // Update viewer count label if it exists
    const countEl = document.getElementById('pbCountLabel');
    if (countEl) {
      if (peers.length === 0) {
        countEl.innerHTML = "";
      } else if (peers.length === 1) {
        countEl.innerHTML = `<span style="color:#24963F;font-weight:800;">Only you</span>`;
      } else {
        countEl.innerHTML = `<span style="font-weight:800;color:#2D2D2D">${peers.length} viewing now</span>`;
      }
    }

    const vpCountChip = document.getElementById('vpCountChip');
    if (vpCountChip) vpCountChip.textContent = peers.length;

    // Render viewers panel list if it exists
    this.renderViewersPanelList(peers);

    // Handle overflow
    if (hidden.length > 0) {
      if (this.moreCount) this.moreCount.textContent = `+${hidden.length}`;
      if (this.moreBtn) this.moreBtn.title = hidden.map((u) => u.displayName || u.profileName || u.username).join(', ');

      hidden.forEach((user) => {
        if (this.dropdown) {
          const item = document.createElement('div');
          item.className = 'au-dropdown-item';
          item.textContent = user.displayName || user.profileName || user.username;
          this.dropdown.appendChild(item);
        }
      });

      if (this.overflowEl) this.overflowEl.style.display = '';
      if (this.avatarsEl.id === 'pbAvatars') {
        let pbOverflow = this.avatarsEl.querySelector('.pb-overflow');
        if (!pbOverflow) {
          pbOverflow = document.createElement('div');
          pbOverflow.className = 'pb-overflow';
          pbOverflow.addEventListener('click', () => {
            if (typeof toggleViewersPanel === 'function') toggleViewersPanel();
          });
          this.avatarsEl.appendChild(pbOverflow);
        }
        pbOverflow.style.display = '';
        pbOverflow.textContent = `+${hidden.length}`;
        pbOverflow.title = `${hidden.length} more people viewing`;
      }
    } else {
      if (this.overflowEl) this.overflowEl.style.display = 'none';
      if (this.avatarsEl.id === 'pbAvatars') {
        const pbOverflow = this.avatarsEl.querySelector('.pb-overflow');
        if (pbOverflow) pbOverflow.style.display = 'none';
      }
    }
  }

  /**
   * Create an avatar element for a user
   */
  createAvatarElement(user, container, index = 0) {
    const av = document.createElement('div');
    // Support both styles
    av.className = container.id === 'pbAvatars' ? 'pb-avatar' : 'au-avatar';
    
    const isMe = user.username === this.username;
    if (isMe) av.classList.add('is-you');

    const displayName = user.displayName || user.profileName || user.username || '?';
    const initials = displayName.split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase();
    const avatarContent = user.image || user.profilePic || initials;

    av.innerHTML = avatarContent;
    
    if (container.id === 'pbAvatars') {
      av.style.background = user.bgColor || this.stringToColor(user.username || '');
      av.style.zIndex = 50 - index;
    } else {
      av.style.setProperty('--au-hue', this.stringToHue(user.username || ''));
    }

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = container.id === 'pbAvatars' ? 'pb-avatar-tip' : 'au-tooltip';

    const lastSeenTime = user.ts ? new Date(user.ts).toLocaleTimeString() : 'Just now';
    const statusLabel = user.status === 'on_break' ? 'On Break' : (user.status === 'idle' ? 'Idle' : 'Active');
    const statusColor =
      user.status === 'on_break' ? '#ffc107' : user.status === 'idle' ? '#dc3545' : '#24963F';

    if (container.id === 'pbAvatars') {
      tooltip.innerHTML = `
        ${this.escapeHtml(displayName)}${isMe ? ' <span style="color:#ff9090">(You)</span>' : ''}<br>
        <span style="opacity:.75;font-size:.6rem">${this.mapRoleName(user.role)} (${statusLabel})</span>
      `;
    } else {
      tooltip.innerHTML = `
        <div class="aut-header">
          <span class="aut-dot" style="background-color: ${statusColor}"></span>
          <strong class="aut-name">${this.escapeHtml(displayName)}</strong>
        </div>
        <div class="aut-dept">🏢 ${user.dept || 'General'}</div>
        <div class="aut-role">🛡️ ${(user.role || 'user').toUpperCase()}</div>
        <div class="aut-status">Status: ${statusLabel}</div>
        <div class="aut-seen">Last Seen: ${lastSeenTime}</div>
      `;
    }

    av.appendChild(tooltip);
    container.appendChild(av);
  }

  /**
   * Render viewers panel dropdown list
   */
  renderViewersPanelList(viewers) {
    const list = document.getElementById('vpList');
    if (!list) return;

    const roleColors = {
      "Admin": "#CB202D",
      "QA Analyst": "#1565C0",
      "Team Leader": "#2E7D32",
      "Vendor": "#6A1B9A",
      "Agent": "#37474F",
      "Editor": "#e65100"
    };

    list.innerHTML = viewers.map(v => {
      const isMe = v.username === this.username;
      const roleName = this.mapRoleName(v.role);
      const rc = roleColors[roleName] || "#555";
      const statusLabel = v.status === 'on_break' ? 'On Break' : (v.status === 'idle' ? 'Idle' : 'Online');
      const statusColor = v.status === 'on_break' ? '#ffc107' : (v.status === 'idle' ? '#dc3545' : '#24963F');
      const pulseAnim = v.status === 'idle' ? 'none' : 'liveGlow 2s infinite';
      const displayName = v.displayName || v.profileName || v.username || '';
      const initials = displayName.split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase();
      const avatarContent = v.image || v.profilePic || initials;
      const color = v.bgColor || this.stringToColor(v.username || '');

      return `
        <div class="vp-item">
          <div class="vp-avatar" style="background:${color}">${avatarContent}</div>
          <div class="vp-info">
            <div class="vp-name">${this.escapeHtml(displayName)}</div>
            <div class="vp-role" style="color:${rc}">${roleName}</div>
          </div>
          <div class="vp-active-dot" title="${statusLabel}" style="background-color: ${statusColor}; animation: ${pulseAnim};"></div>
          ${isMe ? `<span class="vp-badge-you">You</span>` : `<span class="vp-joined-time">Active</span>`}
        </div>
      `;
    }).join("") || `<div style="padding:16px;text-align:center;font-size:.8rem;color:#bbb;">No viewers yet</div>`;
  }

  /**
   * Populate/Update You chip
   */
  updateYouChip() {
    const chip  = document.getElementById("pbYouChip");
    const av    = document.getElementById("pbYouAvatar");
    const name  = document.getElementById("pbYouName");
    const role  = document.getElementById("pbYouRole");
    if (!chip) return;

    const displayName = window.currentUserDisplayName || this.username || '';
    const initials = displayName.split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase();
    const avatarContent = window.currentUserProfilePic || initials;

    if (av) {
      av.innerHTML = avatarContent;
      av.style.background = window.currentUserBgColor || this.stringToColor(this.username || '');
    }
    if (name) name.textContent = displayName;
    if (role) role.textContent = this.mapRoleName(this.role);
    chip.classList.add("visible");
  }

  /**
   * Update live status text/dot
   */
  updateLiveStatus(state) {
    const dot = document.getElementById('pbLiveDot');
    const text = document.getElementById('pbLiveText');
    if (!dot || !text) return;

    const map = {
      online:    { dotCls: "online",  color: "#24963F", label: "Live"         },
      localonly: { dotCls: "online",  color: "#24963F", label: "Live"         },
      pending:   { dotCls: "pending", color: "#F5A623", label: "Connecting…"  },
      offline:   { dotCls: "offline", color: "#ccc",    label: "Disconnected" }
    };
    const s = map[state] || map.pending;
    dot.className = "pb-live-dot " + s.dotCls;
    text.textContent = s.label;
    text.style.color = s.color;
    text.className = "pb-live-text " + s.dotCls;
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
   * Convert string to consistent hex color
   */
  stringToColor(str) {
    const palette = [
      "#CB202D","#1565C0","#2E7D32","#6A1B9A",
      "#C62828","#00695C","#E65100","#283593",
      "#4E342E","#37474F"
    ];
    if (!str) return palette[0];
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

  /**
   * Map database roles to friendly display roles
   */
  mapRoleName(role) {
    if (!role) return 'Agent';
    const map = {
      'admin': 'Admin',
      'quality_analyst': 'QA Analyst',
      'qa_analyst': 'QA Analyst',
      'team_lead': 'Team Leader',
      'teamlead': 'Team Leader',
      'vendor': 'Vendor',
      'user': 'Agent',
      'editor': 'Editor'
    };
    return map[role.toLowerCase()] || role;
  }

  /**
   * Helper to escape HTML characters
   */
  escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
      const peers = [];
      Object.keys(val).forEach(deptKey => {
        const deptData = val[deptKey];
        if (deptData && typeof deptData === 'object') {
          Object.values(deptData).forEach(user => {
            if (user && user.username) {
              peers.push(user);
            }
          });
        }
      });
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
