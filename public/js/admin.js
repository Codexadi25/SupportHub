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
        showToast(result.details || 'Cands uploaded, refreshing...', 'success');
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
        const res = await api('/api/admin/users/bulk', 'POST', { usernames: lines });
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

  // Active Users handled by public/js/activeUsersRealtime.js (included in admin panel partial)

  const cleanupLogsBtn = document.getElementById('cleanupLogsBtn');
  if (cleanupLogsBtn) cleanupLogsBtn.addEventListener('click', async () => {
    if (!confirm('Cleanup logs older than 30 days?')) return;
    try {
      await api('/api/admin/cleanup-logs', 'POST', { days: 30, limit: 500 });
      showToast('Logs cleaned', 'success');
      document.getElementById('log-list').innerHTML = '<p>Logs cleaned.</p>';
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

  // Users table rendering & actions
  const usersTbody = document.getElementById('admin-users-table-body');
  const searchInput = document.getElementById('admin-user-search');

  async function fetchUsers() {
    return api('/api/admin/users');
  }

  async function renderUsersTable() {
    try {
      const users = await fetchUsers();
      const filter = (searchInput?.value || '').toLowerCase().trim();
      usersTbody.innerHTML = users.filter(u => u.username.toLowerCase().includes(filter)).map((u, i) => {
        const modified = u.updatedAt ? new Date(u.updatedAt).toLocaleString() : '';
        return `<tr data-user-id="${u._id}" style="background:${i%2===0?'#fff':'#f7fbff'}">
          <td style="padding:8px">${u.username}</td>
          <td style="padding:8px">
            <span class="masked-pass" data-user-id="${u._id}">••••••••</span>
          </td>
          <td style="padding:8px">
            <select class="user-role-select" data-user-id="${u._id}">
              <option value="new"${u.role==='new'?' selected':''}>new</option>
              <option value="user"${u.role==='user'?' selected':''}>user</option>
              <option value="editor"${u.role==='editor'?' selected':''}>editor</option>
              <option value="team_lead"${u.role==='team_lead'?' selected':''}>team_lead</option>
              <option value="quality_analyst"${u.role==='quality_analyst'?' selected':''}>quality_analyst</option>
              <option value="vendor"${u.role==='vendor'?' selected':''}>vendor</option>
              <option value="admin"${u.role==='admin'?' selected':''}>admin</option>
            </select>
          </td>
          <td style="padding:8px">${modified}</td>
          <td style="padding:8px">
            <div style="display:flex;gap:6px">
              <button class="btn btn-set-password" data-user-id="${u._id}">Reset Password</button>
              <button class="btn btn-reset-password" data-user-id="${u._id}">👁</button>
              <button class="btn btn-delete-user" data-user-id="${u._id}">Delete</button>
            </div>
          </td>
        </tr>`; }).join('');
    } catch (err) {
      showToast('Failed to fetch users', 'error');
    }
  }

  // initial render and refresh button
  renderUsersTable();
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', renderUsersTable);
  if (searchInput) searchInput.addEventListener('input', renderUsersTable);

  // Delegated actions on users table
  document.body.addEventListener('click', async (e) => {
    const target = e.target;
    // reset & view temp password (eye)
    if (target.matches('.btn-reset-password')) {
      const id = target.dataset.userId;
      if (!confirm('Reset password and show temporary password?')) return;
      try {
        const res = await api(`/api/admin/users/${id}/reset-password`, 'POST');
        modalTitle.textContent = `Temporary password for ${res.tempPassword ? '' : id}`;
        modalForm.innerHTML = `<p>Temporary password (copy now):</p><pre id="temp-pass">${res.tempPassword}</pre><button id="copy-temp-pass" type="button">Copy</button>`;
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
        <label>New Password</label>
        <input id="adminNewPassword" type="password" required minlength="6">
        <button type="submit" class="action-btn">Set Password</button>
      `;
      openModal();
      modalForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const pwd = document.getElementById('adminNewPassword')?.value || '';
        if (pwd.length < 6) return showToast('Password must be at least 6 chars', 'error');
        try {
          await api(`/api/admin/users/${id}/password`, 'PUT', { newPassword: pwd });
          showToast('Password updated', 'success');
          closeModal();
        } catch (err) { showToast(err.message,'error'); }
      };
      return;
    }

    // delete user
    if (target.matches('.btn-delete-user')) {
      const id = target.dataset.userId;
      if (!confirm('Delete this user?')) return;
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
  });

});