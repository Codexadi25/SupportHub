/**
 * User Activity Timeline Module
 * Handles categorization, smart grouping of repetitive pings/heartbeats into collapsible threads,
 * and rendering of user activity (Google My Activity / Instagram Activity style).
 */
(function(window) {
  'use strict';

  /**
   * Determine the semantic category of a log entry
   */
  function categorizeLog(log) {
    const action = String(log.action || '').toLowerCase();
    const msg = String(log.message || log.description || '').toLowerCase();
    const resource = String(log.resource || '').toLowerCase();

    // 1. Routine Pings & Heartbeats
    if (
      action.includes('ping') ||
      action.includes('heartbeat') ||
      action.includes('session_touch') ||
      action.includes('poll') ||
      msg.includes('ping request') ||
      msg.includes('heartbeat')
    ) {
      return {
        category: 'routine',
        badgeClass: 'routine',
        badgeText: 'Routine Heartbeat',
        icon: 'bi-lightning-charge',
        isRoutine: true
      };
    }

    // 2. Authentication & Security
    if (
      action.includes('login') ||
      action.includes('logout') ||
      action.includes('auth') ||
      action.includes('register') ||
      action.includes('password') ||
      action.includes('duplicate_session') ||
      msg.includes('logged in') ||
      msg.includes('logged out') ||
      msg.includes('password')
    ) {
      const isLogin = action.includes('login') || msg.includes('logged in');
      const isLogout = action.includes('logout') || msg.includes('logged out');
      return {
        category: 'auth',
        badgeClass: isLogin ? 'login' : (isLogout ? 'logout' : 'security'),
        badgeText: isLogin ? 'Login' : (isLogout ? 'Logout' : 'Security / Auth'),
        icon: isLogin ? 'bi-box-arrow-in-right' : (isLogout ? 'bi-box-arrow-right' : 'bi-shield-check'),
        isRoutine: false
      };
    }

    // 3. Content & Data Edits (Cands, SOPs, Categories, Private Notes, Permitted Words)
    if (
      resource.includes('cand') ||
      resource.includes('sop') ||
      resource.includes('category') ||
      resource.includes('privatenote') ||
      resource.includes('permittedword') ||
      action.includes('cand') ||
      action.includes('create') ||
      action.includes('update') ||
      action.includes('delete') ||
      action.includes('upload')
    ) {
      let verb = 'Data Event';
      if (action.includes('delete')) verb = 'Deleted Item';
      else if (action.includes('create') || action.includes('add') || action.includes('upload')) verb = 'Created Item';
      else if (action.includes('update') || action.includes('edit')) verb = 'Updated Item';

      return {
        category: 'content',
        badgeClass: action.includes('delete') ? 'danger' : 'content',
        badgeText: `${verb}: ${log.resource || 'Data'}`,
        icon: action.includes('delete') ? 'bi-trash' : (action.includes('create') ? 'bi-plus-circle' : 'bi-pencil-square'),
        isRoutine: false
      };
    }

    // 4. Profile & Identity
    if (
      resource.includes('user') ||
      resource.includes('profile') ||
      action.includes('profile') ||
      action.includes('username') ||
      action.includes('role') ||
      action.includes('avatar')
    ) {
      return {
        category: 'profile',
        badgeClass: 'profile',
        badgeText: 'Profile / Identity',
        icon: 'bi-person-badge',
        isRoutine: false
      };
    }

    // 5. General System
    return {
      category: 'system',
      badgeClass: 'system',
      badgeText: log.action || 'System Event',
      icon: 'bi-gear',
      isRoutine: false
    };
  }

  /**
   * Relative time formatter
   */
  function formatTimeAgo(dateInput) {
    if (!dateInput) return 'Just now';
    const date = new Date(dateInput);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Full date & time formatter
   */
  function formatFullDateTime(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Group raw logs:
   * Compresses consecutive routine pings/heartbeats into an aggregated thread.
   * Keeps meaningful actions (profile changes, cand updates, logins, etc.) as standalone items.
   * Caps the resulting grouped list to maxItems (default 25).
   */
  function groupLogs(rawLogs, maxItems = 25) {
    if (!Array.isArray(rawLogs) || rawLogs.length === 0) return [];

    const grouped = [];
    let currentRoutineGroup = [];

    const flushRoutineGroup = () => {
      if (currentRoutineGroup.length === 0) return;
      if (currentRoutineGroup.length === 1) {
        // Single ping doesn't need to be a thread
        const single = currentRoutineGroup[0];
        grouped.push({
          isThread: false,
          categoryMeta: categorizeLog(single),
          log: single,
          timestamp: single.createdAt
        });
      } else {
        // Thread of multiple consecutive pings
        const newest = currentRoutineGroup[0];
        const oldest = currentRoutineGroup[currentRoutineGroup.length - 1];
        grouped.push({
          isThread: true,
          categoryMeta: {
            category: 'routine',
            badgeClass: 'routine',
            badgeText: `Grouped Thread (${currentRoutineGroup.length} Pings)`,
            icon: 'bi-lightning-charge-fill'
          },
          count: currentRoutineGroup.length,
          latestTime: newest.createdAt,
          oldestTime: oldest.createdAt,
          ip: newest.ip || oldest.ip,
          items: currentRoutineGroup
        });
      }
      currentRoutineGroup = [];
    };

    for (let i = 0; i < rawLogs.length; i++) {
      const log = rawLogs[i];
      const meta = categorizeLog(log);

      if (meta.isRoutine) {
        currentRoutineGroup.push(log);
      } else {
        // Non-routine event: flush any pending routine group first
        flushRoutineGroup();
        grouped.push({
          isThread: false,
          categoryMeta: meta,
          log: log,
          timestamp: log.createdAt
        });
      }
    }

    // Flush any trailing routine items
    flushRoutineGroup();

    // Return the top 25 most recent activity entries/threads
    return grouped.slice(0, maxItems);
  }

  /**
   * Render the activity timeline into container element
   */
  function renderTimeline(container, rawLogs, username) {
    if (!container) return;

    if (!rawLogs || rawLogs.length === 0) {
      container.innerHTML = `
        <div class="uam-empty-state">
          <i class="bi bi-clock-history"></i>
          <p>No recent activity records found for @${username || 'user'}.</p>
        </div>
      `;
      return;
    }

    const groupedItems = groupLogs(rawLogs, 25);

    let html = '';
    groupedItems.forEach((entry, idx) => {
      if (entry.isThread) {
        // Render Collapsible Thread Card (Google My Activity style)
        const count = entry.count;
        const timeAgo = formatTimeAgo(entry.latestTime);
        const latestDateStr = formatFullDateTime(entry.latestTime);
        const oldestDateStr = formatFullDateTime(entry.oldestTime);
        const threadId = `uam-thread-${idx}`;

        const subItemsHtml = entry.items.map(sub => `
          <div class="uam-thread-subitem">
            <span class="uam-thread-bullet">•</span>
            <span class="uam-thread-subtime">${formatFullDateTime(sub.createdAt)}</span>
            <span class="uam-thread-submsg">${sub.message || sub.description || 'Heartbeat ping received'}</span>
            ${sub.ip ? `<span class="uam-thread-subip"><i class="bi bi-geo-alt"></i> ${sub.ip}</span>` : ''}
          </div>
        `).join('');

        html += `
          <div class="uam-timeline-item uam-thread-card">
            <span class="uam-timeline-dot routine"></span>
            <div class="uam-tl-header">
              <span class="uam-tl-badge routine">
                <i class="bi bi-lightning-charge-fill"></i> Routine Heartbeats (${count})
              </span>
              <span class="uam-tl-time">${timeAgo}</span>
            </div>
            <div class="uam-tl-desc">
              Automated session heartbeats kept connection alive between <strong>${oldestDateStr}</strong> and <strong>${latestDateStr}</strong>.
            </div>
            <div class="uam-thread-footer">
              <button type="button" class="uam-thread-toggle-btn" data-thread-target="${threadId}">
                <i class="bi bi-chevron-down"></i> Expand Thread (${count} events)
              </button>
              ${entry.ip ? `<span class="uam-meta-chip"><i class="bi bi-geo-alt"></i> ${entry.ip}</span>` : ''}
            </div>
            <div id="${threadId}" class="uam-thread-sublist" style="display:none;">
              ${subItemsHtml}
            </div>
          </div>
        `;
      } else {
        // Render Standalone Action Card
        const log = entry.log;
        const meta = entry.categoryMeta;
        const timeAgo = formatTimeAgo(log.createdAt);
        const fullDateStr = formatFullDateTime(log.createdAt);

        const message = log.message || log.description || 'User action recorded';
        const resource = log.resource ? `<span class="uam-meta-chip"><strong>Resource:</strong> ${log.resource}</span>` : '';
        const ip = log.ip ? `<span class="uam-meta-chip"><i class="bi bi-geo-alt"></i> ${log.ip}</span>` : '';
        const browser = log.userAgent ? `<span class="uam-meta-chip" title="${log.userAgent}"><i class="bi bi-display"></i> ${log.userAgent.split(' ')[0]}</span>` : '';

        html += `
          <div class="uam-timeline-item uam-single-card">
            <span class="uam-timeline-dot ${meta.badgeClass}"></span>
            <div class="uam-tl-header">
              <span class="uam-tl-badge ${meta.badgeClass}">
                <i class="bi ${meta.icon}"></i> ${meta.badgeText}
              </span>
              <span class="uam-tl-time" title="${fullDateStr}">${timeAgo}</span>
            </div>
            <div class="uam-tl-desc">${message}</div>
            <div class="uam-tl-meta">
              ${resource}
              ${ip}
              ${browser}
              <span class="uam-full-timestamp">${fullDateStr}</span>
            </div>
          </div>
        `;
      }
    });

    container.innerHTML = html;

    // Attach click events to thread toggle buttons
    container.querySelectorAll('.uam-thread-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.threadTarget;
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        const isHidden = targetEl.style.display === 'none';
        targetEl.style.display = isHidden ? 'flex' : 'none';
        btn.classList.toggle('expanded', isHidden);
        btn.innerHTML = isHidden 
          ? `<i class="bi bi-chevron-up"></i> Collapse Thread`
          : `<i class="bi bi-chevron-down"></i> Expand Thread (${targetEl.children.length} events)`;
      });
    });
  }

  // Export module to window
  window.UserActivityTimeline = {
    categorizeLog,
    groupLogs,
    renderTimeline,
    formatTimeAgo,
    formatFullDateTime
  };

})(window);
