/* dashboard.js — Loads all dashboard data and populates charts/tables */

async function loadDashboardData() {
    const q = buildQuery();

    // Parallel fetch
    const [summary, trend, performance, tickets, breaks, weekOff, punctuality, errors, leaderboard, swaps, behavior, heatmap, ahtDist] = await Promise.all([
        api(`/api/performance/summary${q}`),
        api(`/api/performance/trend${q}`),
        api(`/api/performance/performance-trend${q}`),
        api(`/api/performance/tickets${q}`),
        api(`/api/performance/breaks${q}`),
        api(`/api/performance/week-off${q}`),
        api(`/api/performance/punctuality${q}`),
        api(`/api/performance/errors${q}`),
        api(`/api/performance/leaderboard${q}`),
        api(`/api/performance/shift-swaps${q}`),
        api(`/api/performance/behavior-issues${q}`),
        api(`/api/performance/heatmap${q}`),
        api(`/api/performance/aht-distribution${q}`)
    ]);

    // ── KPIs ──────────────────────────────────────────────
    if (summary) {
        const breakdown = summary.statusBreakdown || {};
        const total = Object.values(breakdown).reduce((a,b) => a+b, 0) || 1;
        const presentTypes = (breakdown.present || 0) + (breakdown.work_from_home || 0) + (breakdown.training || 0);
        const attRate = (presentTypes / total) * 100;
        const shrinkage = 100 - attRate;

        // Dynamic targets from resolved scope
        const targets = summary.targets || { attendanceTarget: 80, qualityTarget: 95, ahtTarget: 6.0, ticketsTarget: 300 };

        // Update target DOM labels
        const tPresentEl = document.getElementById('kpi-present-target');
        const tAhtEl = document.getElementById('kpi-aht-target');
        const tQualityEl = document.getElementById('kpi-quality-target');
        const tTicketsEl = document.getElementById('kpi-tickets-target');

        if (tPresentEl) tPresentEl.textContent = `Target: >=${targets.attendanceTarget}% (Max ${100 - targets.attendanceTarget}% Shrinkage)`;
        if (tAhtEl)     tAhtEl.textContent = `Target: <=${targets.ahtTarget} min`;
        if (tQualityEl) tQualityEl.textContent = `Target: >=${targets.qualityTarget}%`;
        if (tTicketsEl) tTicketsEl.textContent = `Target: >=${targets.ticketsTarget}`;

        setKPI('kpi-present',   summary.presentCount,   summary.presentChg,  'up',   shrinkage <= (100 - targets.attendanceTarget));
        setKPI('kpi-absent',    summary.absentCount,    summary.absentChg,   'down', summary.absentCount === 0);
        setKPI('kpi-late',      summary.lateCount,      summary.lateChg,     'flat', summary.lateCount === 0);
        setKPI('kpi-leave',     summary.leaveCount,     null,                null,   (summary.leaveCount / total * 100) <= 10);
        setKPI('kpi-aht',       fmt(summary.avgAHT),    summary.ahtChg,      'up',   summary.avgAHT <= targets.ahtTarget);
        setKPI('kpi-quality',   pct(summary.avgQuality),summary.qualityChg,  'up',   summary.avgQuality >= targets.qualityTarget);
        setKPI('kpi-tickets',   summary.totalTickets,   summary.ticketChg,   'up',   summary.totalTickets >= targets.ticketsTarget);
        setKPI('kpi-behavior',  summary.behaviorIssues, null,                null,   summary.behaviorIssues === 0);
    }

    // ── Attendance Trend ──────────────────────────────────
    if (trend) {
        buildAttendanceTrend(trend.labels, trend.present, trend.absent, trend.leave);
    }

    // ── Attendance Donut ──────────────────────────────────
    if (summary?.statusBreakdown) {
        buildAttendanceDonut(summary.statusBreakdown);
        renderDonutStats(summary.statusBreakdown);
    }

    // ── Performance Trend ─────────────────────────────────
    if (performance) {
        buildPerformanceTrend(performance.labels, performance.quality, performance.aht, performance.csat);
    }

    // ── Ticket Volume ─────────────────────────────────────
    if (tickets) {
        buildTicketVolume(tickets.labels, tickets.data);
    }

    // ── Login Heatmap ─────────────────────────────────────
    if (heatmap) {
        buildLoginHeatmap('loginHeatmap', heatmap);
    }

    // ── Break Pattern ─────────────────────────────────────
    if (breaks) {
        buildBreakPattern(breaks.hours, breaks.avgMins, breaks.shiftCount);
    }

    // ── Week Off ──────────────────────────────────────────
    if (weekOff) {
        buildWeekOff(weekOff.days, weekOff.counts);
    }

    // ── Punctuality ───────────────────────────────────────
    if (punctuality) {
        buildPunctuality(punctuality.agents, punctuality.lateData, punctuality.earlyData);
    }

    // ── Error Pattern ─────────────────────────────────────
    if (errors) {
        buildErrorPattern(errors.categories, errors.counts);
    }

    // ── AHT Distribution ──────────────────────────────────
    if (ahtDist) {
        buildAHT(ahtDist.agents, ahtDist.ahtData, ahtDist.teamAvg);
    }

    // ── Leaderboard ───────────────────────────────────────
    if (leaderboard) renderLeaderboard(leaderboard);

    // ── Shift Swaps ───────────────────────────────────────
    if (swaps) renderShiftSwaps(swaps);

    // ── Behavior Issues ───────────────────────────────────
    if (behavior) renderBehaviorList(behavior);
}

function setKPI(id, value, change, direction, isMet) {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = value;

    const targetEl = document.getElementById(`${id}-target`);
    if (targetEl && isMet !== undefined && isMet !== null) {
        targetEl.classList.remove('met', 'not-met');
        targetEl.classList.add(isMet ? 'met' : 'not-met');
    }

    if (change == null) return;
    const chgEl = document.getElementById(`${id}-chg`);
    if (!chgEl) return;
    const sign = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
    chgEl.textContent = `${sign} ${Math.abs(change)}%`;
    chgEl.className = `kpi-change ${change > 0 ? (direction === 'up' ? 'up' : 'down') : (direction === 'up' ? 'down' : 'up')}`;
}

function renderDonutStats(breakdown) {
    const el = document.getElementById('donutStats');
    if (!el) return;
    const clrs = { present:'var(--clr-green)', absent:'var(--clr-red)', leave:'var(--clr-amber)',
                   work_from_home:'var(--clr-blue)', week_off:'var(--clr-purple)', training:'var(--clr-teal)' };
    const total = Object.values(breakdown).reduce((a,b) => a+b, 0) || 1;
    el.innerHTML = Object.entries(breakdown).map(([k,v]) => `
        <div class="donut-stat-item">
            <span class="donut-stat-label">
                <span style="width:8px;height:8px;border-radius:50%;background:${clrs[k]||'#888'};display:inline-block;"></span>
                ${k.replace('_',' ')}
            </span>
            <span class="donut-stat-val">${v} <span style="color:var(--clr-text-muted);font-size:10px;">(${Math.round(v/total*100)}%)</span></span>
        </div>`).join('');
}

function renderLeaderboard(agents) {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody || !agents?.length) return;
    tbody.innerHTML = agents.map((a, i) => `
        <tr>
            <td style="color:var(--clr-text-muted);font-family:var(--font-mono);">${i+1}</td>
            <td>
                <div class="emp-cell">
                    <div class="emp-avatar" style="position:relative;">
                        ${(a.agentName||'?').charAt(0).toUpperCase()}
                        <span style="position:absolute;bottom:-4px;right:-4px;font-size:12px;" title="${a.league}">${a.medal}</span>
                    </div>
                    <div>
                        <div class="emp-name">
                            ${a.agentName}
                            <span class="league-badge" style="background:${a.leagueColor}20;color:${a.leagueColor};border:1px solid ${a.leagueColor}40;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700;">${a.league}</span>
                        </div>
                        <div class="emp-id">${a.employeeId}</div>
                    </div>
                </div>
            </td>
            <td><span class="score-cell ${scoreClass(a.attendancePct)}">${pct(a.attendancePct)}</span></td>
            <td><span class="score-cell font-mono">${fmt(a.avgAHT)} m</span></td>
            <td><span class="score-cell ${scoreClass(a.avgQuality)}">${pct(a.avgQuality)}</span></td>
            <td class="font-mono">${a.totalTickets || 0}</td>
            <td>
                <div class="progress-bar" style="width:80px;">
                    <div class="progress-fill ${scoreClass(a.performanceScore)}" style="width:${a.performanceScore||0}%;background:${a.performanceScore>=80?'var(--clr-green)':a.performanceScore>=60?'var(--clr-amber)':'var(--clr-red)'};"></div>
                </div>
                <div style="font-size:10px;font-family:var(--font-mono);margin-top:2px;">${pct(a.performanceScore)}</div>
            </td>
            <td class="font-mono">${fmt(a.avgLoginHrs)} h</td>
            <td>${a.behaviorIssues > 0 ? `<span class="badge badge-absent">${a.behaviorIssues}</span>` : '<span style="color:var(--clr-text-muted);">—</span>'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openEmpModal('${a.userId}')">View</button></td>
        </tr>`).join('');
}

function renderShiftSwaps(swaps) {
    const el = document.getElementById('shiftSwapList');
    const countEl = document.getElementById('swapCount');
    if (!el) return;
    if (countEl) countEl.textContent = `${swaps.length} pending`;
    if (!swaps.length) { el.innerHTML = '<div style="color:var(--clr-text-muted);padding:20px;text-align:center;">No pending swaps</div>'; return; }
    el.innerHTML = swaps.slice(0,5).map(s => `
        <div class="info-row">
            <div>
                <div style="font-weight:600;color:var(--clr-text-primary);font-size:13px;">${s.agentName}</div>
                <div style="font-size:11px;color:var(--clr-text-muted);">${s.originalShift} → ${s.newShift} · ${new Date(s.date).toLocaleDateString()}</div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-success btn-sm" onclick="approveSwap('${s._id}')">✓ Approve</button>
                <button class="btn btn-danger btn-sm" onclick="rejectSwap('${s._id}')">✕</button>
            </div>
        </div>`).join('');
}

function renderBehaviorList(issues) {
    const el = document.getElementById('behaviorList');
    if (!el) return;
    if (!issues.length) { el.innerHTML = '<div style="color:var(--clr-text-muted);padding:20px;text-align:center;">No recent issues 🎉</div>'; return; }
    const sev = { low:'var(--clr-blue)', medium:'var(--clr-amber)', high:'var(--clr-red)', critical:'var(--clr-red)' };
    el.innerHTML = issues.slice(0,5).map(b => `
        <div class="info-row">
            <div>
                <div style="font-weight:600;color:var(--clr-text-primary);font-size:13px;">${b.agentName}</div>
                <div style="font-size:11px;color:var(--clr-text-muted);">${b.type} · ${new Date(b.date).toLocaleDateString()}</div>
            </div>
            <span style="font-size:10px;font-weight:700;color:${sev[b.severity]||'#888'};text-transform:uppercase;">${b.severity}</span>
        </div>`).join('');
}

async function approveSwap(id) {
    const r = await api(`/api/performance/shift-swap/${id}/approve`, { method: 'POST' });
    if (r?.success) { toast('Shift swap approved', 'success'); loadDashboardData(); }
    else toast('Failed to approve swap', 'error');
}
async function rejectSwap(id) {
    const r = await api(`/api/performance/shift-swap/${id}/reject`, { method: 'POST' });
    if (r?.success) { toast('Shift swap rejected', 'info'); loadDashboardData(); }
    else toast('Failed', 'error');
}

async function openEmpModal(userId) {
    openModal('empModal');
    const data = await api(`/api/performance/employee/${userId}${buildQuery()}`);
    if (!data) return;
    document.getElementById('empModalName').textContent = data.agentName || 'Employee';
    document.getElementById('empModalBody').innerHTML = `
        <div style="font-size:13px;color:var(--clr-text-secondary);">
            <p>Full profile → <a href="/performance/employee?id=${userId}" style="color:var(--clr-blue);">Open Employee Page</a></p>
        </div>`;
}

// ── Load on page init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // set default date range to "this week"
    const to = document.getElementById('filterTo');
    const from = document.getElementById('filterFrom');
    if (to && !to.value)   to.value   = today();
    if (from && !from.value) from.value = weekAgo();

    if (document.getElementById('attendanceTrendChart')) {
        loadDashboardData();
    }
});
