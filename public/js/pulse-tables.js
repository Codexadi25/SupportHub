/* tables.js — Employee profile page logic */

let _empPage = 1;
const _empPageSize = 15;
let _empAllRecords = [];

async function loadEmployee(userId) {
    if (!userId) return;
    const q = buildQuery({ userId });

    const [profile, records, radar, trend, breaks, errors, behavior] = await Promise.all([
        api(`/api/performance/employee/${userId}${q}`),
        api(`/api/performance/records${q}`),
        api(`/api/performance/employee/${userId}/radar${q}`),
        api(`/api/performance/employee/${userId}/trend${q}`),
        api(`/api/performance/employee/${userId}/breaks${q}`),
        api(`/api/performance/employee/${userId}/errors${q}`),
        api(`/api/performance/employee/${userId}/behavior${q}`)
    ]);

    // ── Profile Card ──────────────────────────────────────
    if (profile) {
        const avatarEl = document.getElementById('empAvatar');
        if (profile.image || profile.profilePic) {
            avatarEl.innerHTML = profile.image || profile.profilePic;
            avatarEl.style.background = 'none';
        } else {
            const init = (profile.agentName || '?').charAt(0).toUpperCase();
            avatarEl.textContent = init;
            avatarEl.style.background = 'var(--clr-blue)';
        }
        document.getElementById('empName').textContent = profile.agentName || '—';
        document.getElementById('empMeta').textContent =
            `ID: ${profile.employeeId || '—'} · Dept: ${profile.department || '—'} · Team: ${profile.teamName || '—'} · Shift: ${profile.shiftType || '—'}`;

        // KPIs
        const targets = profile.targets || { attendanceTarget: 80, qualityTarget: 95, ahtTarget: 6.0, ticketsTarget: 300 };

        // Update target DOM labels
        const tPresentEl = document.getElementById('emp-kpi-present-target');
        const tAhtEl = document.getElementById('emp-kpi-aht-target');
        const tQualityEl = document.getElementById('emp-kpi-quality-target');

        if (tPresentEl) tPresentEl.textContent = `Target: >=${targets.attendanceTarget}%`;
        if (tAhtEl)     tAhtEl.textContent = `Target: <=${targets.ahtTarget} min`;
        if (tQualityEl) tQualityEl.textContent = `Target: >=${targets.qualityTarget}%`;

        setEmpKPI('emp-kpi-present', pct(profile.attendancePct),  profile.attendancePct >= targets.attendanceTarget);
        setEmpKPI('emp-kpi-aht',     fmt(profile.avgAHT) + ' min', profile.avgAHT <= targets.ahtTarget);
        setEmpKPI('emp-kpi-quality', pct(profile.avgQuality),     profile.avgQuality >= targets.qualityTarget);
        setEmpKPI('emp-kpi-late',    profile.lateDays ?? '--',    profile.lateDays === 0);
        setEmpKPI('emp-kpi-leave',   profile.leavesUsed ?? '--',   (profile.leavesUsed || 0) <= 2);
        setEmpKPI('emp-kpi-issues',  profile.behaviorIssues ?? '--', profile.behaviorIssues === 0);

        const shareImgBtn = document.getElementById('btnShareImage');
        const shareModalBtn = document.getElementById('btnShareModal');
        if (shareImgBtn) shareImgBtn.style.display = 'inline-flex';
        if (shareModalBtn) shareModalBtn.style.display = 'inline-flex';
    }

    // ── Radar Chart ───────────────────────────────────────
    if (radar) {
        buildPerformanceRadar(radar.empData, radar.teamAvg);
        renderRadarLegend(radar.labels, radar.empData, radar.teamAvg);
    }

    // ── Attendance Calendar ───────────────────────────────
    if (records?.data) {
        renderAttendanceCalendar(records.data);
        _empAllRecords = records.data;
        _empPage = 1;
        renderEmpTable();
    }

    // ── Performance Trend ─────────────────────────────────
    if (trend) {
        buildEmpPerformanceTrend(trend.labels, trend.quality, trend.aht);
    }

    // ── Break Pattern ─────────────────────────────────────
    if (breaks) {
        buildEmpBreakPattern(breaks.hours, breaks.avgMins, breaks.shiftCount);
    }

    // ── Error List ────────────────────────────────────────
    renderErrorList(errors);

    // ── Behavior Log ─────────────────────────────────────
    renderBehaviorLog(behavior);
}

function setEmpKPI(id, value, isMet) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '--';

    const targetEl = document.getElementById(`${id}-target`);
    if (targetEl && isMet !== undefined && isMet !== null) {
        targetEl.classList.remove('met', 'not-met');
        targetEl.classList.add(isMet ? 'met' : 'not-met');
    }
}

function renderRadarLegend(labels, empData, teamAvg) {
    const el = document.getElementById('radarLegend');
    if (!el) return;
    el.innerHTML = (labels || []).map((label, i) => `
        <div class="radar-legend-item">
            <div class="radar-legend-dot" style="background:var(--clr-blue);"></div>
            <span class="radar-legend-label">${label}</span>
            <span class="radar-legend-value" style="color:${
                empData[i] >= teamAvg[i] ? 'var(--clr-green)' : 'var(--clr-amber)'
            };">${empData[i] ?? '--'}</span>
        </div>`).join('');
}

function renderAttendanceCalendar(records) {
    const el = document.getElementById('attendanceCalendar');
    if (!el) return;

    const colorMap = {
        present: 'var(--clr-green)', absent: 'var(--clr-red)',
        leave: 'var(--clr-amber)', week_off: 'var(--clr-purple)',
        work_from_home: 'var(--clr-blue)', half_day: 'rgba(255,179,64,0.7)',
        training: 'var(--clr-teal)', holiday: 'rgba(167,139,250,0.7)'
    };

    // Sort records by date
    const sorted = [...records].sort((a,b) => new Date(a.date) - new Date(b.date));
    if (!sorted.length) { el.innerHTML = '<div style="color:var(--clr-text-muted);text-align:center;padding:20px;">No records</div>'; return; }

    const byDate = {};
    sorted.forEach(r => { byDate[r.date?.split('T')[0]] = r; });

    // Build 7-col grid
    const start = new Date(sorted[0].date);
    const end   = new Date(sorted[sorted.length-1].date);

    // Pad to start on Monday
    const startDay = (start.getDay() + 6) % 7; // 0=Mon
    const totalCells = Math.ceil((startDay + (end - start) / 86400000 + 1) / 7) * 7;

    const days = ['M','T','W','T','F','S','S'];
    let html = `<div class="heat-calendar">`;
    days.forEach(d => { html += `<div style="font-size:9px;color:var(--clr-text-muted);text-align:center;padding-bottom:4px;">${d}</div>`; });

    // Empty cells before start
    for (let i = 0; i < startDay; i++) html += `<div></div>`;

    const cur = new Date(start);
    for (let i = startDay; i < totalCells; i++) {
        if (cur > end) { html += `<div></div>`; } else {
            const key = cur.toISOString().split('T')[0];
            const rec = byDate[key];
            const color = rec ? (colorMap[rec.status] || 'var(--clr-surface-3)') : 'var(--clr-surface-2)';
            const title = rec ? `${key} — ${rec.status}` : key;
            html += `<div class="heat-day" title="${title}" style="background:${color};opacity:${rec?1:0.3};" onclick="scrollToDate('${key}')"></div>`;
            cur.setDate(cur.getDate() + 1);
        }
    }
    html += `</div>`;
    el.innerHTML = html;
}

function renderEmpTable() {
    const tbody = document.getElementById('empRecordsBody');
    const pag   = document.getElementById('empPagination');
    if (!tbody) return;

    const start = (_empPage - 1) * _empPageSize;
    const slice = _empAllRecords.slice(start, start + _empPageSize);
    const total = _empAllRecords.length;
    const pages = Math.ceil(total / _empPageSize);

    tbody.innerHTML = slice.map(r => `
        <tr>
            <td class="font-mono" style="color:var(--clr-text-secondary);">${r.date?.split('T')[0] || '—'}</td>
            <td style="color:var(--clr-text-muted);">${r.weekDay || '—'}</td>
            <td>${statusBadge(r.status || 'present')}</td>
            <td style="color:var(--clr-text-secondary);">${r.shiftType || '—'}</td>
            <td class="font-mono">${r.loginTime || '—'}</td>
            <td class="font-mono">${r.logoutTime || '—'}</td>
            <td class="font-mono">${fmt(r.loginHrs)} h</td>
            <td>
                ${r.isLateLogin
                    ? `<span class="badge badge-leave">+${r.lateLoginMins}m</span>`
                    : '<span style="color:var(--clr-green);">—</span>'}
            </td>
            <td><span class="score-cell ${scoreClass(100 - (r.aht > 10 ? 20 : 0))}">${fmt(r.aht)} m</span></td>
            <td><span class="score-cell ${scoreClass(r.qualityScore)}">${pct(r.qualityScore)}</span></td>
            <td class="font-mono">${r.ticketsProcessed ?? 0}</td>
            <td class="font-mono">${r.totalBreakMins ?? 0} m</td>
            <td>${(r.behaviorIssues?.length || 0) > 0
                ? `<span class="badge badge-absent">${r.behaviorIssues.length}</span>`
                : '—'}</td>
        </tr>`).join('') || `<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--clr-text-muted);">No records found</td></tr>`;

    // Pagination
    if (pag) {
        pag.innerHTML = `
            <span class="page-info">Showing ${Math.min(start+1,total)}–${Math.min(start+_empPageSize,total)} of ${total}</span>
            <button class="page-btn" onclick="_empPage=Math.max(1,_empPage-1);renderEmpTable();">‹</button>
            ${Array.from({length:Math.min(pages,5)},(_,i) => `
                <button class="page-btn ${i+1===_empPage?'active':''}" onclick="_empPage=${i+1};renderEmpTable();">${i+1}</button>`).join('')}
            <button class="page-btn" onclick="_empPage=Math.min(${pages},_empPage+1);renderEmpTable();">›</button>`;
    }
}

function filterEmpTable(query) {
    if (!query.trim()) {
        _empAllRecords = _empAllRecords;
        renderEmpTable();
        return;
    }
    const q = query.toLowerCase();
    const filtered = _empAllRecords.filter(r =>
        (r.date||'').toLowerCase().includes(q) ||
        (r.status||'').toLowerCase().includes(q) ||
        (r.weekDay||'').toLowerCase().includes(q)
    );
    const origRecords = _empAllRecords;
    _empAllRecords = filtered;
    _empPage = 1;
    renderEmpTable();
    _empAllRecords = origRecords;
}

function renderErrorList(errors) {
    const el = document.getElementById('empErrorList');
    if (!el) return;
    if (!errors?.length) { el.innerHTML = '<div style="color:var(--clr-text-muted);padding:20px;text-align:center;">No errors recorded ✅</div>'; return; }
    el.innerHTML = errors.map(e => `
        <div class="info-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                <span style="font-weight:600;color:var(--clr-text-primary);">${e.category}</span>
                <span class="badge badge-absent">${e.count}×</span>
            </div>
            <p style="font-size:12px;color:var(--clr-text-secondary);">${e.description}</p>
            ${e.suggestion ? `<div style="font-size:11px;background:var(--clr-blue-dim);color:var(--clr-blue);padding:6px 10px;border-radius:6px;border-left:2px solid var(--clr-blue);">
                💡 ${e.suggestion}</div>` : ''}
        </div>`).join('');
}

function renderBehaviorLog(issues) {
    const el = document.getElementById('empBehaviorLog');
    if (!el) return;
    if (!issues?.length) { el.innerHTML = '<div style="color:var(--clr-text-muted);padding:20px;text-align:center;">No issues recorded 🎉</div>'; return; }
    const sevClr = { low: 'badge-wfh', medium: 'badge-leave', high: 'badge-absent', critical: 'badge-absent' };
    el.innerHTML = issues.map(b => `
        <div class="info-row" style="flex-direction:column;align-items:flex-start;gap:4px;">
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                <span style="font-weight:600;color:var(--clr-text-primary);">${b.type}</span>
                <span class="badge ${sevClr[b.severity]||'badge-leave'}">${b.severity}</span>
            </div>
            ${b.note ? `<p style="font-size:12px;color:var(--clr-text-secondary);">${b.note}</p>` : ''}
            <span style="font-size:10px;color:var(--clr-text-muted);">${new Date(b.date||Date.now()).toLocaleDateString()}</span>
        </div>`).join('');
}

function scrollToDate(dateStr) {
    const rows = document.querySelectorAll('#empRecordsBody tr');
    const match = [...rows].find(r => r.cells[0]?.textContent?.includes(dateStr));
    if (match) match.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.APP && window.APP.currentPage === 'employee') {
        const empSel = document.getElementById('empSelector');
        if (empSel && empSel.value) {
            loadEmployee(empSel.value);
        }
    }
});



