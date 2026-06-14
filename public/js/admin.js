// Client-side admin actions: fetch users, create bulk users, upload cands, role/password management.
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('form-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalForm = document.getElementById('modal-form');
  const modalCloseBtn = document.querySelector('.modal-close-btn');
  const openModal = () => modal && (modal.style.display = 'flex');
  const closeModal = () => {
    if (!modal) return;
    modal.style.display = 'none';
    if (modalForm) modalForm.innerHTML = '';
  };
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  let departments = [];
  let teams = [];
  async function loadDepartments() {
    try {
      departments = await api('/api/admin/departments');
      window.__departmentsList = departments;
    } catch (e) {
      console.error('Failed to load departments:', e);
    }
  }
  async function loadTeams() {
    try {
      teams = await api('/api/admin/teams');
      window.__teamsList = teams;
    } catch (e) {
      console.error('Failed to load teams:', e);
    }
  }

  // Create department form
  const createDeptForm = document.getElementById('create-dept-form');
  if (createDeptForm) {
    createDeptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('dept-name');
      const descInput = document.getElementById('dept-desc');
      if (!nameInput || !nameInput.value.trim()) return showToast('Department name is required', 'error');
      
      try {
        await api('/api/admin/departments', 'POST', {
          name: nameInput.value.trim(),
          description: descInput?.value?.trim() || ''
        });
        showToast('Department created successfully!', 'success');
        nameInput.value = '';
        if (descInput) descInput.value = '';
        
        await loadDepartments();
        renderUsersTable();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const showToast = (m, t='success') => {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(m);
    const toast = document.createElement('div');
    toast.className = `toast ${t}`;
    toast.textContent = m;
    container.appendChild(toast);
    setTimeout(()=>{ toast.remove(); }, 3500);
  };

  const api = async (url, method='GET', body=null, isForm=false) => {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (isForm) { opts.body = body; }
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (!res.ok) {
      let err = { message: res.statusText };
      try { err = await res.json(); } catch(e){}
      throw new Error(err.message || 'Request failed');
    }
    if (res.status === 204) return null;
    return res.json().catch(()=>null);
  };

  // Bulk upload cands
  const bulkUploadForm = document.getElementById('bulk-upload-form');
  if (bulkUploadForm) {
    bulkUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('jsonFile');
      const modeSelect = document.getElementById('upload-mode');
      if (!fileInput || !fileInput.files || !fileInput.files[0]) return showToast('Select a JSON file', 'error');
      const fd = new FormData();
      fd.append('jsonFile', fileInput.files[0]);
      fd.append('mode', modeSelect.value);
      try {
        const result = await api('/api/admin/bulk-upload-cands', 'POST', fd, true);
        showToast(result.message || 'Cands uploaded, refreshing...', 'success');
        setTimeout(()=> location.reload(), 900);
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // Bulk create users
  const bulkUserForm = document.getElementById('bulk-user-form');
  const bulkResults = document.getElementById('bulk-user-results');
  const newCredsOutput = document.getElementById('new-creds-output');
  if (bulkUserForm) {
    bulkUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = document.getElementById('bulk-usernames')?.value || '';
      const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if (!lines.length) return showToast('Enter at least one username', 'error');
      try {
        // *** FIX 1: Changed route from /api/admin/users/bulk to /api/users/bulk ***
        const res = await api('/api/users/bulk', 'POST', { usernames: lines });
        if (res?.createdUsers?.length) {
          bulkResults.style.display = 'block';
          newCredsOutput.textContent = res.createdUsers.map(u=>`Username: ${u.username}\nPassword: ${u.password}\n`).join('\n');
          showToast('Users created', 'success');
          renderUsersTable(); // refresh
        } else {
          showToast('No users created (duplicates skipped)', 'info');
        }
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  const copyCredsBtn = document.getElementById('copy-creds-btn');
  if (copyCredsBtn) copyCredsBtn.addEventListener('click', () => {
    const text = newCredsOutput?.textContent || '';
    if (!text) return showToast('No credentials to copy', 'error');
    navigator.clipboard.writeText(text).then(()=>showToast('Copied!'));
  });

  // Logs
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');
  if (refreshLogsBtn) refreshLogsBtn.addEventListener('click', async () => {
    try {
      const logs = await api('/api/admin/logs');
      const logList = document.getElementById('log-list');
      logList.innerHTML = logs.length ? logs.map(l => `<div style="padding:8px;border-bottom:1px solid #eee"><strong>[${new Date(l.createdAt).toLocaleString()}] ${l.level || ''}</strong><div>${l.message}</div><pre>${l.stack||''}</pre></div>`).join('') : '<p>No logs found.</p>';
    } catch (err) { showToast(err.message,'error'); }
  });

  // Active Users handled by userActivityDashboard.js

  const cleanupLogsBtn = document.getElementById('cleanupLogsBtn');
  if (cleanupLogsBtn) cleanupLogsBtn.addEventListener('click', async () => {
    if (!confirm('Cleanup logs older than 30 days?')) return;
    try {
      await api('/api/admin/cleanup-logs', 'POST');
      showToast('Logs cleaned', 'success');
      const logList = document.getElementById('log-list');
      if (logList) logList.innerHTML = '<p>Logs cleaned.</p>';
    } catch (err) { showToast(err.message,'error'); }
  });

  // Message cleanup
  const cleanupMessagesBtn = document.getElementById('cleanupMessagesBtn');
  if (cleanupMessagesBtn) cleanupMessagesBtn.addEventListener('click', async () => {
    if (!confirm('This will delete all expired messages. Continue?')) return;
    try {
      const result = await api('/api/messages/cleanup', 'POST');
      showToast(`Message cleanup completed. ${result.message}`, 'success');
    } catch (err) { showToast(err.message,'error'); }
  });

  // Users table rendering, real-time presence sync & actions
  const usersTbody = document.getElementById('admin-users-table-body');
  const searchInput = document.getElementById('admin-user-search');

  let presenceMap = new Map();
  let showLoggedInOnly = false;
  let adminDb = null;

  async function initFirebasePresence() {
    const indicator = document.getElementById('connection-indicator');
    if (!indicator) return;
    indicator.textContent = '🟡 Connecting…';
    indicator.className = 'status-indicator connecting';

    try {
      const res = await fetch('/api/user-activity/firebase-config');
      if (!res.ok) throw new Error('Firebase config not available');
      const { config } = await res.json();
      if (!config.databaseURL) throw new Error('databaseURL missing');

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      adminDb = firebase.database();

      indicator.textContent = '🟢 Live';
      indicator.className = 'status-indicator connected';

      // Listen to presence updates
      adminDb.ref('presence').on('value', snap => {
        const val = snap.val() || {};
        presenceMap.clear();

        Object.keys(val).forEach(deptKey => {
          const deptData = val[deptKey];
          if (deptData && typeof deptData === 'object') {
            Object.values(deptData).forEach(u => {
              if (u && u.username) {
                presenceMap.set(u.username.toLowerCase(), {
                  status: u.status || 'offline',
                  profilePic: u.profilePic || '',
                  profileName: u.profileName || '',
                  bgColor: u.bgColor || ''
                });
              }
            });
          }
        });

        // Trigger reactive render when presence changes
        renderUsersTable();
      });
    } catch (err) {
      // Failed to load presence - log is silent
      indicator.textContent = '🔴 Disconnected';
      indicator.className = 'status-indicator disconnected';
    }
  }

  function togglePresenceCollapse() {
    showLoggedInOnly = !showLoggedInOnly;
    const btn = document.getElementById('btn-toggle-presence-collapse');
    if (btn) {
      if (showLoggedInOnly) {
        btn.innerHTML = '<i class="bi bi-arrows-expand"></i> Show All Registered';
        btn.className = 'btn btn-success';
      } else {
        btn.innerHTML = '<i class="bi bi-arrows-collapse"></i> Show Logged-in Only';
        btn.className = 'btn btn-warning';
      }
    }
    renderUsersTable();
  }
  window.togglePresenceCollapse = togglePresenceCollapse;

  async function fetchUsers() {
    return api('/api/admin/users');
  }

  async function renderUsersTable() {
    if (!usersTbody) return;
    try {
      const users = await fetchUsers();
      const filter = (searchInput?.value || '').toLowerCase().trim();
      
      // Get all team leads in the system to resolve alignments
      const teamLeads = users.filter(usr => usr && usr.role === 'team_lead');
      const isAdminUser = window.currentUserRole === 'admin';
      
      const filtered = users.filter(u => {
        if (!u) return false;
        // Search filter
        const matchSearch = (u.username || '').toLowerCase().includes(filter);
        if (!matchSearch) return false;

        // Logged in filter
        if (showLoggedInOnly) {
          const p = presenceMap.get((u.username || '').toLowerCase());
          const status = p ? p.status : 'offline';
          return status !== 'offline' && status !== 'unavailable';
        }
        return true;
      });

      // Sort: online users first, then by username
      filtered.sort((a, b) => {
        const pA = presenceMap.get((a.username || '').toLowerCase());
        const pB = presenceMap.get((b.username || '').toLowerCase());
        const statusA = pA ? pA.status : 'offline';
        const statusB = pB ? pB.status : 'offline';
        
        const onlineA = (statusA !== 'offline' && statusA !== 'unavailable') ? 1 : 0;
        const onlineB = (statusB !== 'offline' && statusB !== 'unavailable') ? 1 : 0;
        
        if (onlineA !== onlineB) return onlineB - onlineA;
        return (a.username || '').localeCompare(b.username || '');
      });

      usersTbody.innerHTML = filtered.map((u, i) => {
        if (!u) return '';
        const modified = u.updatedAt ? new Date(u.updatedAt).toLocaleString() : '';
        
        const p = presenceMap.get((u.username || '').toLowerCase());
        const status = p ? p.status : 'offline';
        const livePic = p ? p.profilePic : '';
        const liveProfileName = p ? p.profileName : '';
        
        const statusLabels = {
          online: 'Online',
          on_break: 'On Break',
          idle: 'Idle',
          unresponsive: 'Unresponsive',
          offline: 'Offline',
          unavailable: 'Offline'
        };
        const statusLabel = statusLabels[status] || 'Offline';
        const statusClass = (status === 'offline' || status === 'unavailable') ? 'offline' : status;
        
        const statusHtml = `
          <span class="user-status-cell ${statusClass}">
            <span class="status-dot"></span>
            <span>${statusLabel}</span>
          </span>
        `;

        const picToUse = livePic || u.profilePic;
        const avatarHtml = picToUse
          ? `<span class="user-avatar-small" style="vertical-align: middle; margin-right: 6px;">${picToUse}</span>`
          : `<span class="user-avatar-small" style="vertical-align: middle; margin-right: 6px; background:#e2e8f0; color:#475569;">${((liveProfileName || u.profileName || u.username || '?').charAt(0) || '?').toUpperCase()}</span>`;

        const canEditRole = ['admin', 'vendor', 'team_lead'].includes(window.currentUserRole);
        const canEditPassword = ['admin', 'vendor'].includes(window.currentUserRole);
        const canAlignTeam = ['admin', 'vendor', 'team_lead'].includes(window.currentUserRole);

        let selectHtml = '';
        let roleHtml = '';
        let teamHtml = '';
        let actionsHtml = '';

        if (canEditRole) {
          const deptOptions = (window.__departmentsList || []).map(d => 
              `<option value="${d.slug}"${u.department === d.slug ? ' selected' : ''}>${d.name}</option>`
          ).join('');
          
          const hasCurrentDept = (window.__departmentsList || []).some(d => d.slug === u.department);
          const fallbackOption = (!hasCurrentDept && u.department && u.department !== 'none' && u.department !== 'general') ? 
              `<option value="${u.department}" selected>${u.department}</option>` : '';
          
          selectHtml = `
            <select class="user-dept-select" data-user-id="${u._id}" style="width:110px;padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
              <option value="none"${u.department === 'none' || !u.department ? ' selected' : ''}>None</option>
              <option value="general"${u.department === 'general' ? ' selected' : ''}>general</option>
              ${fallbackOption}
              ${deptOptions}
            </select>
          `;

          roleHtml = `
            <select class="user-role-select" data-user-id="${u._id}" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
              <option value="new"${u.role==='new'?' selected':''}>new</option>
              <option value="user"${u.role==='user'?' selected':''}>user</option>
              <option value="editor"${u.role==='editor'?' selected':''}>editor</option>
              <option value="team_lead"${u.role==='team_lead'?' selected':''}>team_lead</option>
              <option value="quality_analyst"${u.role==='quality_analyst'?' selected':''}>quality_analyst</option>
              <option value="vendor"${u.role==='vendor'?' selected':''}>vendor</option>
              <option value="admin"${u.role==='admin'?' selected':''}>admin</option>
            </select>
          `;
        } else {
          selectHtml = `<span style="font-weight:600;color:var(--text-muted);font-size:13px;">${u.department || 'None'}</span>`;
          roleHtml = `<span class="badge" style="background:var(--primary-light);color:var(--primary);padding:3px 8px;border-radius:12px;font-weight:700;font-size:11px;">${(u.role || '').toUpperCase()}</span>`;
        }

        if (canAlignTeam) {
          const teamOptions = (window.__teamsList || []).map(t => {
            const tlName = t.teamLeadId ? (t.teamLeadId.displayName || t.teamLeadId.username) : 'No TL';
            return `<option value="${t._id}"${String(u.teamId) === String(t._id) ? ' selected' : ''}>${t.name} (TL: ${tlName})</option>`;
          }).join('');

          teamHtml = `
            <select class="user-team-select" data-user-id="${u._id}" style="width:180px;padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
              <option value="none"${!u.teamId ? ' selected' : ''}>None</option>
              ${teamOptions}
            </select>
          `;
        } else {
          const matchedTeam = (window.__teamsList || []).find(t => String(t._id) === String(u.teamId));
          const tlName = matchedTeam && matchedTeam.teamLeadId ? (matchedTeam.teamLeadId.displayName || matchedTeam.teamLeadId.username) : '';
          teamHtml = matchedTeam ? `<span style="font-weight:600;">${matchedTeam.name}</span> ${tlName ? `<span style="font-size:11px;color:var(--text-muted);"> (TL: ${tlName})</span>` : ''}` : '<span style="color:#94a3b8">None</span>';
        }

        let actionButtons = [];
        if (canEditPassword) {
          actionButtons.push(`<button class="btn btn-set-password" data-user-id="${u._id}" style="padding:4px 8px;font-size:11px;">Reset Password</button>`);
          actionButtons.push(`<button class="btn btn-reset-password" data-user-id="${u._id}" title="Reset password to username" style="padding:4px 8px;font-size:11px;">Set Default Password</button>`);
        }
        if (window.currentUserRole === 'admin' && u.role !== 'admin') {
          actionButtons.push(`<button class="btn btn-delete-user" data-user-id="${u._id}" data-username="${u.username}" style="padding:4px 8px;font-size:11px;background:#ef4444;color:#fff;">Delete</button>`);
        }

        actionsHtml = actionButtons.length 
          ? `<div style="display:flex;gap:6px">${actionButtons.join('')}</div>`
          : `<span style="color:#94a3b8;font-size:12px;font-style:italic;">No Actions</span>`;

        const displayName = liveProfileName || u.profileName || '';
        return `<tr data-user-id="${u._id}">
          <td style="padding:10px 8px">
            <div style="display:flex;align-items:center;gap:8px;">
              ${avatarHtml}
              <div style="display:flex;flex-direction:column;">
                <span style="font-weight:600;">${u.username || ''}</span>
                ${displayName ? `<span style="font-size:11px;color:var(--text-muted);">${displayName}</span>` : ''}
              </div>
            </div>
          </td>
          <td style="padding:10px 8px">${statusHtml}</td>
          <td style="padding:10px 8px">
            <span class="masked-pass" data-user-id="${u._id}">••••••••</span>
          </td>
          <td style="padding:10px 8px">
            ${roleHtml}
          </td>
          <td style="padding:10px 8px">
            ${selectHtml}
          </td>
          <td style="padding:10px 8px;font-size:12px;">
            ${teamHtml}
          </td>
          <td style="padding:10px 8px">${modified}</td>
          <td style="padding:10px 8px">
            ${actionsHtml}
          </td>
        </tr>`; }).join('');
    } catch (err) {
      console.error('[Admin Directory] Refresh Error:', err);
      showToast('Failed to fetch users', 'error');
    }
  }

  // initial render and refresh button
  Promise.all([loadDepartments(), loadTeams()]).then(() => {
    renderUsersTable();
    initFirebasePresence();
  });
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', () => {
    renderUsersTable();
  });
  if (searchInput) searchInput.addEventListener('input', renderUsersTable);

  // Delegated actions on users table
  document.body.addEventListener('click', async (e) => {
    const target = e.target;
    // reset password to username
    if (target.matches('.btn-reset-password')) {
      const id = target.dataset.userId;
      const username = target.closest('tr')?.firstElementChild?.textContent || 'this user';
      if (!confirm(`Reset password for "${username}"? This will set their password to be the same as their username.`)) return;
      try {
        // *** FIX 2: Changed res.tempPassword to res.newPassword ***
        const res = await api(`/api/admin/users/${id}/reset-password`, 'POST');
        modalTitle.textContent = `Password Reset for ${username}`;
        modalForm.innerHTML = `
          <p>Password has been reset to:</p>
          <pre id="temp-pass" style="background:#eee;padding:10px;border-radius:4px;">${res.newPassword}</pre>
          <button id="copy-temp-pass" type="button" class="action-btn">Copy</button>`;
        
        openModal();
        document.getElementById('copy-temp-pass')?.addEventListener('click', () => {
          const txt = document.getElementById('temp-pass')?.textContent || '';
          navigator.clipboard.writeText(txt).then(()=>showToast('Copied!'));
        });
        renderUsersTable();
      } catch (err) { showToast(err.message,'error'); }
      return;
    }

    // set password (opens modal form)
    if (target.matches('.btn-set-password')) {
      const id = target.dataset.userId;
      modalTitle.textContent = 'Set New Password';
      modalForm.innerHTML = `
        <div class="form-group">
          <label>New Password</label>
          <input class="form-control" id="adminNewPassword" type="password" required minlength="6" style="padding:8px;width:100%;box-sizing:border-box;">
          <button type="submit" class="action-btn" style="margin-top:10px;">Confirm and Change Password</button>
        </div>
        `;
      openModal();
      modalForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const pwd = document.getElementById('adminNewPassword')?.value || '';
        if (pwd.length < 6) return showToast('Password must be at least 6 chars', 'error');
        try {
          // *** FIX 3: Changed body from { newPassword: pwd } to { password: pwd } ***
          await api(`/api/admin/users/${id}/password`, 'PUT', { newPassword: pwd });
          showToast('Password updated', 'success');
          closeModal();
        } catch (err) { 
            showToast(err.message,'error');
            // This is a common error, so let's add a hint.
            if (err.message.includes('Not Found')) {
                showToast('Hint: Make sure the /api/admin/users/:id/password PUT route is defined in adminRoutes.js', 'info');
            }
            else if(err.message.includes('required')) {
              showToast('ERR: 400, Password is required')
            }
            else {
              showToast(err.message, 'error'); // This now shows a useful error!
            }
        }
      };
      return;
    }

    // delete user
    if (target.matches('.btn-delete-user')) {
      const id = target.dataset.userId;
      const username = target.dataset.username || 'this user';
      
      const confirmUser = prompt(`To delete user "${username}", please type their username to confirm:`);
      if (confirmUser !== username) {
        showToast('Username confirmation failed. User deletion cancelled.', 'error');
        return;
      }
      
      try {
        await api(`/api/admin/users/${id}`, 'DELETE');
        showToast('User deleted', 'success');
        renderUsersTable();
      } catch (err) { showToast(err.message,'error'); }
      return;
    }
  });

  // delegated role change
  document.body.addEventListener('change', async (e) => {
    const target = e.target;
    if (target.matches('.user-role-select')) {
      const id = target.dataset.userId;
      const role = target.value;
      try {
        await api(`/api/admin/users/${id}/role`, 'PUT', { role });
        showToast('Role updated', 'success');
        renderUsersTable();
      } catch (err) { showToast(err.message,'error'); }
    }
    if (target.matches('.user-dept-select')) {
      const id = target.dataset.userId;
      const department = target.value;
      try {
        await api(`/api/admin/users/${id}/role`, 'PUT', { department });
        showToast('Department updated', 'success');
        renderUsersTable();
      } catch (err) { showToast(err.message,'error'); }
    }
    if (target.matches('.user-team-select')) {
      const id = target.dataset.userId;
      const teamId = target.value;
      try {
        await api(`/api/admin/users/${id}/role`, 'PUT', { teamId });
        showToast('Team alignment updated successfully', 'success');
        renderUsersTable();
      } catch (err) { showToast(err.message,'error'); }
    }
  });

  // --- AI Permitted Words Library Management ---
  const permittedWordsTbody = document.getElementById('permitted-words-table-body');
  const permittedWordsCount = document.getElementById('permitted-words-count');
  const permittedSearchInput = document.getElementById('permitted-words-search');
  const btnAddWord = document.getElementById('btn-add-permitted-word');
  const btnSyncWords = document.getElementById('btn-sync-permitted-words');

  async function fetchAndRenderPermittedWords(searchQuery = '') {
    if (!permittedWordsTbody) return;
    try {
      const url = `/api/admin/permitted-words?search=${encodeURIComponent(searchQuery)}`;
      const words = await api(url);
      
      if (permittedWordsCount) {
        permittedWordsCount.textContent = `Total Permitted Words: ${words.length}`;
      }

      if (!words.length) {
        permittedWordsTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted, #64748b);">No permitted words found.</td></tr>`;
        return;
      }

      const isAdminOrVendor = ['admin', 'vendor'].includes(window.currentUserRole);

      permittedWordsTbody.innerHTML = words.map(w => {
        const similarPills = (w.similarWords || []).map(sw => 
          `<span class="cand-tag-chip tag" style="background:var(--primary-light, rgba(37,99,235,0.1));color:var(--primary, #2563eb);border-radius:4px;padding:2px 6px;margin:2px;display:inline-block;font-size:11px;">${sw}</span>`
        ).join(' ');
        
        const sourceLabel = w.source === 'cands_db' ? 'Cands DB' : 'Manual';
        const sourceClass = w.source === 'cands_db' ? 'status-new' : 'status-updated';

        let deleteBtnHtml = '';
        if (isAdminOrVendor) {
          deleteBtnHtml = `<button class="btn btn-delete-permitted-word" data-word-id="${w._id}" data-word="${w.word}" style="padding:4px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;">Delete</button>`;
        }

        return `<tr data-word-id="${w._id}">
          <td style="padding:10px 12px;font-weight:600;">${w.word}</td>
          <td style="padding:10px 12px;">${similarPills || '<span style="color:#cbd5e1;font-size:11px;">None</span>'}</td>
          <td style="padding:10px 12px;">
            <span class="cand-status-tag ${sourceClass}" style="font-size:11px;">${sourceLabel}</span>
          </td>
          ${isAdminOrVendor ? `<td style="padding:10px 12px;text-align:center;">${deleteBtnHtml}</td>` : ''}
        </tr>`;
      }).join('');

    } catch (err) {
      console.error('[Admin permitted words] Render error:', err);
      showToast('Failed to load permitted words list', 'error');
    }
  }

  // Bind Listeners
  if (permittedSearchInput) {
    permittedSearchInput.addEventListener('input', (e) => {
      fetchAndRenderPermittedWords(e.target.value);
    });
  }

  if (btnSyncWords) {
    btnSyncWords.addEventListener('click', async () => {
      const originalHtml = btnSyncWords.innerHTML;
      btnSyncWords.disabled = true;
      btnSyncWords.innerHTML = `<i class="bi bi-arrow-repeat"></i> Syncing...`;
      try {
        const res = await api('/api/admin/sync-permitted-words', 'POST');
        showToast(res.message || 'Synchronization completed successfully!', 'success');
        fetchAndRenderPermittedWords(permittedSearchInput?.value || '');
      } catch (err) {
        showToast(err.message || 'Sync failed', 'error');
      } finally {
        btnSyncWords.disabled = false;
        btnSyncWords.innerHTML = originalHtml;
      }
    });
  }

  if (btnAddWord) {
    btnAddWord.addEventListener('click', async () => {
      const wordInput = document.getElementById('new-permitted-word');
      const val = wordInput?.value?.trim();
      if (!val) return showToast('Please enter a word', 'error');

      const originalHtml = btnAddWord.innerHTML;
      btnAddWord.disabled = true;
      btnAddWord.innerHTML = `<i class="bi bi-plus-circle"></i> Adding...`;

      try {
        await api('/api/admin/permitted-words', 'POST', { word: val });
        showToast(`Word "${val}" added successfully!`, 'success');
        if (wordInput) wordInput.value = '';
        fetchAndRenderPermittedWords(permittedSearchInput?.value || '');
      } catch (err) {
        showToast(err.message || 'Add failed', 'error');
      } finally {
        btnAddWord.disabled = false;
        btnAddWord.innerHTML = originalHtml;
      }
    });
  }

  // Delegated Delete
  document.body.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.matches('.btn-delete-permitted-word')) {
      const wordId = target.dataset.wordId;
      const wordText = target.dataset.word;
      if (!confirm(`Are you sure you want to delete "${wordText}" from permitted vocabulary?`)) return;

      try {
        await api(`/api/admin/permitted-words/${wordId}`, 'DELETE');
        showToast(`Word "${wordText}" deleted.`, 'success');
        fetchAndRenderPermittedWords(permittedSearchInput?.value || '');
      } catch (err) {
        showToast(err.message || 'Delete failed', 'error');
      }
    }
  });

  // Initial call
  if (permittedWordsTbody) {
    fetchAndRenderPermittedWords();
  }

});