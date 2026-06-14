/* utils.js — Shared helpers */

// ── Toast ─────────────────────────────────────────────────
function toast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Modal ─────────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}
// Close on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
        document.body.style.overflow = '';
    }
});

// ── Date Helpers ──────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function weekAgo() {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
}
function monthStart() {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
}
function quarterStart() {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3, 1).toISOString().split('T')[0];
}

function applyRangePreset(val) {
    const from = document.getElementById('filterFrom');
    const to   = document.getElementById('filterTo');
    if (!from || !to) return;
    to.value = today();
    const map = { today: today, week: weekAgo, month: monthStart, quarter: quarterStart };
    if (map[val]) { from.value = map[val](); if (val !== 'custom') applyFilters(); }
}

function applyFilters() {
    const params = new URLSearchParams({
        from:   document.getElementById('filterFrom')?.value || '',
        to:     document.getElementById('filterTo')?.value   || '',
        dept:   document.getElementById('filterDept')?.value  || '',
        team:   document.getElementById('filterTeam')?.value  || '',
    });
    window.APP.filters = Object.fromEntries(params);
    refreshDashboard();
}

// ── API Helpers ───────────────────────────────────────────
async function api(endpoint, opts = {}) {
    try {
        let url = endpoint;
        if (url.startsWith('/api/performance')) {
            url = '/performance' + url;
        }
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...opts
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

function buildQuery(extra = {}) {
    const f = window.APP.filters || {};
    const p = { org: window.APP.org, ...f, ...extra };
    return '?' + new URLSearchParams(p).toString();
}

// ── Score colouring ───────────────────────────────────────
function scoreClass(v) {
    if (v >= 80) return 'score-high';
    if (v >= 60) return 'score-medium';
    return 'score-low';
}

// ── Status badge ──────────────────────────────────────────
function statusBadge(s) {
    const map = {
        present: 'badge-present', absent: 'badge-absent', leave: 'badge-leave',
        work_from_home: 'badge-wfh', week_off: 'badge-week_off',
        half_day: 'badge-half_day', training: 'badge-training'
    };
    return `<span class="badge ${map[s] || ''}">${s.replace('_',' ')}</span>`;
}

// ── Number formatting ─────────────────────────────────────
function fmt(n, dec = 1) { return n != null ? Number(n).toFixed(dec) : '--'; }
function pct(n) { return n != null ? `${Math.round(n)}%` : '--'; }

// ── Refresh placeholder (wired up in dashboard.js) ───────
function refreshDashboard() {
    if (typeof loadDashboardData === 'function' && document.getElementById('attendanceTrendChart') && window.APP.currentPage === 'dashboard') {
        loadDashboardData();
        toast('Dashboard data refreshed!', 'success');
    } else if (typeof loadEmployee === 'function' && window.APP.currentPage === 'employee') {
        const empSel = document.getElementById('empSelector');
        if (empSel && empSel.value) {
            loadEmployee(empSel.value);
            toast('Employee profile refreshed!', 'success');
        } else {
            window.location.reload();
        }
    } else if (typeof loadTrackingPageData === 'function') {
        loadTrackingPageData();
        toast('Page data refreshed!', 'success');
    } else {
        window.location.reload();
    }
}
function switchOrg(org) {
    window.APP.org = org;
    refreshDashboard();
}

// ── Sidebar nav ───────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        // breadcrumb
        const label = item.querySelector('span:not(.nav-icon):not(.nav-badge)')?.textContent?.trim();
        const bc = document.getElementById('breadcrumbCurrent');
        if (bc && label) bc.textContent = label;
    });
});

// ── Sidebar toggle (mobile) ───────────────────────────────
const toggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
if (toggle) toggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// ── Demo Action Runner ───────────────────────────────────
async function runDemoAction(action) {
    if (action === 'clear' && !confirm('Are you sure you want to clear all mock demo data?')) return;
    toast(action === 'seed' ? 'Seeding demo data…' : 'Clearing demo data…', 'info');
    try {
        const res = await fetch(`/performance/api/performance/demo/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            toast(data.message, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            toast(data.error || 'Action failed', 'error');
        }
    } catch(err) {
        toast('Connection error', 'error');
    }
}

/* ─────────────────────────────────────────────────────────
   NEW: SEARCH BY EMP ID
   ───────────────────────────────────────────────────────── */
async function searchByEmpId() {
    const input = document.getElementById('empIdSearchInput');
    const empId = input?.value?.trim();
    if (!empId) {
        toast('Please enter an Employee ID', 'warning');
        return;
    }
    
    toast(`Searching for Employee ID: ${empId}...`, 'info');
    try {
        const res = await api(`/api/performance/employee/by-empid/${empId}`);
        if (res && res.success && res.userId) {
            const selector = document.getElementById('empSelector');
            if (selector) {
                selector.value = res.userId;
            }
            loadEmployee(res.userId);
            toast('Employee profile loaded!', 'success');
        } else {
            toast('Employee not found or invalid ID', 'error');
        }
    } catch (err) {
        console.error('Search error:', err);
        toast('Search failed: ' + err.message, 'error');
    }
}

/* ─────────────────────────────────────────────────────────
   NEW: MY PROFILE & SESSION HANDLERS
   ───────────────────────────────────────────────────────── */
async function openMyProfileModal() {
    openModal('myProfileModal');
    // Fetch profile data
    const data = await api('/api/users/profile');
    if (data && data.success && data.user) {
        const u = data.user;
        document.getElementById('profileUsername').value = u.username || '';
        document.getElementById('profileDisplayName').value = u.displayName || u.username || '';
        document.getElementById('profileEmail').value = u.email || '';
        document.getElementById('profileIp').textContent = u.ip || 'unknown';
        document.getElementById('profileSessionId').textContent = u.sessionId || 'unknown';
        document.getElementById('profileSessionId').title = u.sessionId || '';
        
        document.getElementById('profileOrgBadge').textContent = 'Org: ' + (u.organization || 'zomato');
        document.getElementById('profileRoleBadge').textContent = 'Role: ' + (u.role || 'user').replace('_', ' ');
        document.getElementById('profileDeptBadge').textContent = 'Dept: ' + (u.department || 'general');
    } else {
        toast('Failed to load profile data', 'error');
    }
}

async function saveMyProfile(e) {
    if (e) e.preventDefault();
    const displayName = document.getElementById('profileDisplayName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    
    if (!displayName || !email) {
        toast('Display Name and Email are required', 'warning');
        return;
    }
    
    const body = JSON.stringify({ displayName, email });
    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            toast('Profile updated successfully!', 'success');
            closeModal('myProfileModal');
            // Instantly update display name in sidebar footer
            const sidebarName = document.getElementById('sidebar-user-displayname');
            if (sidebarName) {
                sidebarName.textContent = displayName;
            }
        } else {
            toast(data.message || 'Failed to save profile changes', 'error');
        }
    } catch (err) {
        console.error('Profile update error:', err);
        toast('Failed to update profile: ' + err.message, 'error');
    }
}
