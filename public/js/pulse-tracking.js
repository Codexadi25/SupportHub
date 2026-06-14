/* pulse-tracking.js — Dynamic rendering for all other performance tracking tabs */

let _trackingPage = 1;
let _trackingPageSize = 15;
let _trackingAllRecords = [];
let _activeTrackingPage = '';

document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.tracking-page-container');
    if (container) {
        _activeTrackingPage = container.getAttribute('data-page');
        const title = container.getAttribute('data-title');
        initTrackingPage(container, _activeTrackingPage, title);
    }
});

function initTrackingPage(container, page, title) {
    let html = '';
    
    // Header block
    html += `
    <div class="section-header">
        <div>
            <div class="section-title">${title}</div>
            <div class="section-subtitle" id="trackingSubtitle">Manage and monitor ${title.toLowerCase()} for the organization</div>
        </div>
        <div class="section-actions" id="trackingActions"></div>
    </div>`;

    if (page === 'trends') {
        // Trends Page: Canvas rows
        html += `
        <div class="chart-grid chart-grid-2-1" style="margin-bottom:16px;">
            <div class="chart-card">
                <div class="chart-title">Attendance Trend</div>
                <div class="chart-subtitle">Daily present / absent / leave trend</div>
                <div class="chart-container" style="height:250px;">
                    <canvas id="attendanceTrendChart"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-title">Today's Distribution</div>
                <div class="chart-subtitle">Attendance status breakdown</div>
                <div class="donut-wrap" style="height:250px;align-items:center;">
                    <canvas id="attendanceDonutChart" class="donut-canvas" style="width:150px;height:150px;"></canvas>
                    <div class="donut-stats" id="donutStats"></div>
                </div>
            </div>
        </div>
        <div class="chart-grid chart-grid-2" style="margin-bottom:16px;">
            <div class="chart-card">
                <div class="chart-title">Performance Weekly Trend</div>
                <div class="chart-subtitle">Quality · AHT · CSAT averaged daily</div>
                <div class="chart-container" style="height:220px;">
                    <canvas id="performanceTrendChart"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-title">Daily Ticket Volume</div>
                <div class="chart-subtitle">Total tickets processed per day</div>
                <div class="chart-container" style="height:220px;">
                    <canvas id="ticketVolumeChart"></canvas>
                </div>
            </div>
        </div>`;
    } else if (page === 'upload') {
        // Upload page
        html += `
        <div class="chart-grid chart-grid-2-1">
            <div class="card" style="padding:24px;">
                <div class="card-header"><div class="card-title">📁 Upload Roster or Performance Sheet</div></div>
                <div style="margin-top:10px;">
                    <div class="form-group" style="margin-bottom:16px;">
                        <label style="display:block;font-size:11px;color:var(--clr-text-muted);text-transform:uppercase;margin-bottom:6px;font-weight:600;">Data Type</label>
                        <select id="pageUploadType" class="form-select" style="width:100%;padding:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);border-radius:6px;">
                            <option value="full">Full Performance & Attendance (consolidated)</option>
                            <option value="attendance">Attendance & Login Timings only</option>
                            <option value="performance">Performance KPIs only (Quality/AHT/Tickets)</option>
                        </select>
                    </div>
                    <div id="pageDropZone" style="border:2px dashed var(--clr-border);border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s;" ondragover="event.preventDefault();this.style.borderColor='var(--clr-blue)';" ondragleave="this.style.borderColor='var(--clr-border)';" ondrop="handlePageFileDrop(event)">
                        <span style="font-size:36px;display:block;margin-bottom:12px;">📄</span>
                        <span style="font-size:13px;color:var(--clr-text-secondary);font-weight:500;">Drag and drop your CSV or Excel file here, or <span style="color:var(--clr-blue);text-decoration:underline;">browse files</span></span>
                        <input type="file" id="pageFileInput" style="display:none;" onchange="handlePageFileSelect(event)" accept=".csv,.xlsx,.xls" />
                    </div>
                    <div id="pageUploadProgress" style="display:none;margin-top:16px;">
                        <div class="progress-bar"><div class="progress-fill" id="pageUploadProgressFill" style="width:0%;"></div></div>
                        <div style="font-size:11px;color:var(--clr-text-secondary);margin-top:4px;" id="pageUploadStatusText">Uploading...</div>
                    </div>
                </div>
            </div>
            <div class="card" style="padding:24px;">
                <div class="card-header"><div class="card-title">ℹ️ Instructions & Formats</div></div>
                <div style="font-size:12px;color:var(--clr-text-secondary);line-height:1.8;">
                    <p style="margin-bottom:10px;"><strong>Supported Formats:</strong> CSV (.csv) and Excel (.xlsx, .xls) files.</p>
                    <p style="margin-bottom:10px;"><strong>Roster Upload mapping:</strong> Employee IDs will be automatically resolved by name if the Roster spreadsheet lacks Employee IDs but matches valid agent names in the team.</p>
                    <p style="margin-bottom:15px;">Always download the sample format to match the columns:</p>
                    <a href="/performance/sample.csv" class="btn btn-ghost btn-sm" style="display:inline-flex;width:100%;justify-content:center;">⬇ Download Sample CSV Format</a>
                </div>
            </div>
        </div>`;
    } else if (page === 'export') {
        // Export Page
        html += `
        <div class="chart-grid chart-grid-2">
            <div class="card" style="padding:20px;">
                <div class="card-header"><div class="card-title">⬇ Download Excel / CSV Reports</div></div>
                <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">
                    <div>
                        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--clr-text-secondary);margin-bottom:6px;">
                            <input type="checkbox" id="page_exp_attendance" checked /> Attendance & Hours Roster
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--clr-text-secondary);margin-bottom:6px;">
                            <input type="checkbox" id="page_exp_performance" checked /> Quality & AHT metrics
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--clr-text-secondary);margin-bottom:6px;">
                            <input type="checkbox" id="page_exp_breaks" checked /> Breaks & Punctuality patterns
                        </label>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
                        <button class="btn btn-primary" onclick="exportTrackingData('xlsx')">📁 Export Excel (.xlsx)</button>
                        <button class="btn btn-ghost" onclick="exportTrackingData('csv')">📄 Export CSV (.csv)</button>
                    </div>
                </div>
            </div>
            
            <div class="card" style="padding:20px;">
                <div class="card-header"><div class="card-title">🔗 Public Sharing & Links</div></div>
                <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">
                    <p style="font-size:11px;color:var(--clr-text-muted);">Generate public, read-only report links with 7-day expiration. Great for sharing with vendors or clients.</p>
                    <button class="btn btn-ghost" onclick="generatePagePublicLink()" style="justify-content:center;">🔗 Generate Public Sharing Link</button>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <input type="text" id="pagePublicLinkInput" readonly placeholder="Sharing link will appear here..." style="flex:1;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;font-size:11px;outline:none;" />
                        <button class="btn btn-primary" id="pageCopyLinkBtn" onclick="copyPageLink()" style="display:none;">Copy</button>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (page === 'overview') {
        // Team Overview grid
        html += `
        <div id="overviewGrid" class="chart-grid chart-grid-3">
            <div style="grid-column:span 3;text-align:center;padding:40px;color:var(--clr-text-muted);">Loading Team Overview...</div>
        </div>`;
    } else if (page === 'settings') {
        // Settings page container
        html += `
        <div class="chart-grid chart-grid-3" id="settingsContainer">
            <div style="grid-column:span 3;text-align:center;padding:40px;color:var(--clr-text-muted);">Loading Settings...</div>
        </div>`;
    } else if (page === 'breaks-recorder') {
        html += `
        <div class="card" style="padding:20px;">
            <div class="table-toolbar" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:none;border-bottom:none;padding:0 0 16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;">
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <div style="font-size:13px;font-weight:600;color:var(--clr-text-primary);" id="tableTitleText">📋 Break Recorder (Real-time)</div>
                    <div id="deptFilterContainer" style="display:none;">
                        <select id="breakDeptFilter" class="form-select" style="padding:6px 12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);border-radius:6px;font-size:12px;" onchange="loadBreakRecorderUsers()">
                            <!-- Populated dynamically -->
                        </select>
                    </div>
                </div>
                <div style="display:flex;gap:12px;align-items:center;">
                    <div class="table-search" style="margin-bottom:0;">
                        <span class="icon">🔍</span>
                        <input type="text" id="breakSearchInput" placeholder="Search agents..." oninput="filterBreakRecorderTable()" />
                    </div>
                    <button class="btn btn-ghost btn-sm" onclick="loadBreakRecorderUsers()" title="Refresh Agent List">🔄 Refresh</button>
                </div>
            </div>
            
            <!-- Bulk actions banner -->
            <div id="bulkActionsBanner" style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" id="breakSelectAll" onchange="toggleSelectAllBreaks(this.checked)" style="cursor:pointer;" />
                    <span id="selectedCountText" style="color:var(--clr-text-secondary);font-weight:500;">0 agents selected</span>
                </div>
                <div>
                    <button class="btn btn-primary btn-sm" id="bulkToggleBreakBtn" onclick="bulkToggleBreaks()" disabled>⚡ Bulk Punch / Remove Break</button>
                </div>
            </div>

            <div class="table-wrap" style="border:1px solid var(--clr-border);border-radius:var(--radius-md);">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:40px;text-align:center;"></th>
                            <th>Agent Name</th>
                            <th>Employee ID</th>
                            <th>Status</th>
                            <th>Break Start</th>
                            <th style="text-align:right;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="breakRecorderTableBody">
                        <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--clr-text-muted);">Loading agents…</td></tr>
                    </tbody>
                </table>
            </div>
        </div>`;
    } else {
        // Standard Table Pages (attendance, performance, shifts, leaves, breaks, behavior, errors, teams)
        html += `
        <div class="card">
            <div class="table-toolbar" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:none;border-bottom:none;padding:0 0 16px;">
                <div style="font-size:13px;font-weight:600;color:var(--clr-text-primary);" id="tableTitleText">📋 List View</div>
                <div class="table-search">
                    <span class="icon">🔍</span>
                    <input type="text" placeholder="Search roster date, agent, ID…" oninput="filterTrackingTable(this.value)" />
                </div>
            </div>
            <div class="table-wrap" style="border:1px solid var(--clr-border);border-radius:var(--radius-md);">
                <table class="data-table" id="trackingDataTable">
                    <thead id="trackingTableHeader">
                        <tr><th>Loading...</th></tr>
                    </thead>
                    <tbody id="trackingTableBody">
                        <tr><td style="text-align:center;padding:30px;color:var(--clr-text-muted);">Loading…</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="trackingPagination"></div>
        </div>`;
    }

    container.innerHTML = html;

    // Load actual data
    loadTrackingPageData();
}

async function loadTrackingPageData() {
    if (!_activeTrackingPage) return;
    const q = buildQuery();

    try {
        if (_activeTrackingPage === 'trends') {
            const [trend, summary, performance, tickets] = await Promise.all([
                api(`/api/performance/trend${q}`),
                api(`/api/performance/summary${q}`),
                api(`/api/performance/performance-trend${q}`),
                api(`/api/performance/tickets${q}`)
            ]);
            if (trend) buildAttendanceTrend(trend.labels, trend.present, trend.absent, trend.leave);
            if (summary?.statusBreakdown) {
                buildAttendanceDonut(summary.statusBreakdown);
                const donutEl = document.getElementById('donutStats');
                if (donutEl) {
                    const clrs = { present:'var(--clr-green)', absent:'var(--clr-red)', leave:'var(--clr-amber)',
                                   work_from_home:'var(--clr-blue)', week_off:'var(--clr-purple)', training:'var(--clr-teal)' };
                    const total = Object.values(summary.statusBreakdown).reduce((a,b) => a+b, 0) || 1;
                    donutEl.innerHTML = Object.entries(summary.statusBreakdown).map(([k,v]) => `
                        <div class="donut-stat-item">
                            <span class="donut-stat-label">
                                <span style="width:8px;height:8px;border-radius:50%;background:${clrs[k]||'#888'};display:inline-block;"></span>
                                ${k.replace('_',' ')}
                            </span>
                            <span class="donut-stat-val">${v} <span style="color:var(--clr-text-muted);font-size:10px;">(${Math.round(v/total*100)}%)</span></span>
                        </div>`).join('');
                }
            }
            if (performance) buildPerformanceTrend(performance.labels, performance.quality, performance.aht, performance.csat);
            if (tickets) buildTicketVolume(tickets.labels, tickets.data);

        } else if (_activeTrackingPage === 'overview') {
            const leaderboard = await api(`/api/performance/leaderboard${q}`);
            renderOverviewGrid(leaderboard || []);

        } else if (_activeTrackingPage === 'behavior') {
            const issues = await api(`/api/performance/behavior-issues${q}`);
            _trackingAllRecords = issues || [];
            _trackingPage = 1;
            renderBehaviorTable();

        } else if (_activeTrackingPage === 'teams') {
            const res = await api('/api/admin/teams');
            _trackingAllRecords = res?.teams || [];
            _trackingPage = 1;
            renderTeamsTable();

        } else if (_activeTrackingPage === 'upload') {
            // Setup click upload handler
            const zone = document.getElementById('pageDropZone');
            if (zone) zone.onclick = () => document.getElementById('pageFileInput').click();

        } else if (_activeTrackingPage === 'export') {
            // placeholder ready

        } else if (_activeTrackingPage === 'settings') {
            const data = await api('/api/performance/settings');
            renderSettingsView(data);

        } else if (_activeTrackingPage === 'breaks-recorder') {
            await loadBreakRecorderUsers();

        } else {
            // attendance, performance, shifts, leaves, breaks, errors
            const res = await api(`/api/performance/records${q}`);
            _trackingAllRecords = res?.data || [];
            _trackingPage = 1;
            renderGenericTable();
        }
    } catch (e) {
        console.error('Error loading tracking page data:', e);
    }
}

// ── Overview Rendering ────────────────────────────────────
function renderOverviewGrid(agents) {
    const el = document.getElementById('overviewGrid');
    if (!el) return;
    if (!agents.length) { el.innerHTML = '<div style="grid-column:span 3;text-align:center;padding:40px;color:var(--clr-text-muted);">No employee metrics available.</div>'; return; }
    
    el.innerHTML = agents.map(a => `
        <div class="card" style="padding:18px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--clr-blue);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;">
                    ${(a.agentName||'?').charAt(0).toUpperCase()}
                </div>
                <div>
                    <div style="font-weight:600;color:var(--clr-text-primary);">${a.agentName}</div>
                    <div style="font-size:10px;color:var(--clr-text-muted);">${a.employeeId}</div>
                </div>
                <div style="margin-left:auto;text-align:right;">
                    <div style="font-size:10px;text-transform:uppercase;color:var(--clr-text-muted);font-weight:600;">Composite</div>
                    <div style="font-weight:700;color:var(--clr-green);">${Math.round(a.performanceScore||0)}%</div>
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;background:var(--clr-surface-2);padding:8px 10px;border-radius:6px;">
                <div>
                    <div style="color:var(--clr-text-muted);">Attendance</div>
                    <div style="font-weight:600;color:${a.attendancePct>=80?'var(--clr-green)':'var(--clr-red)'};">${pct(a.attendancePct)}</div>
                </div>
                <div>
                    <div style="color:var(--clr-text-muted);">Quality</div>
                    <div style="font-weight:600;color:${a.avgQuality>=95?'var(--clr-green)':'var(--clr-red)'};">${pct(a.avgQuality)}</div>
                </div>
                <div>
                    <div style="color:var(--clr-text-muted);">Avg AHT</div>
                    <div style="font-weight:600;color:${a.avgAHT<=6.0?'var(--clr-green)':'var(--clr-amber)'};">${fmt(a.avgAHT)} min</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:11px;">
                <span style="color:var(--clr-text-muted);">Tickets: <strong>${a.totalTickets||0}</strong></span>
                <a href="/performance/employee?id=${a.userId}" style="color:var(--clr-blue);font-weight:600;">View Profile →</a>
            </div>
        </div>`).join('');
}

// ── Generic performance/attendance roster rendering ──────
function renderGenericTable() {
    const head = document.getElementById('trackingTableHeader');
    const body = document.getElementById('trackingTableBody');
    const titleText = document.getElementById('tableTitleText');
    if (!body || !head) return;

    let headers = [];
    if (_activeTrackingPage === 'attendance') {
        titleText.textContent = '📅 Daily Attendance Records';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Status', 'Shift', 'Login Time', 'Logout Time', 'Login Hrs', 'Late Login'];
    } else if (_activeTrackingPage === 'performance') {
        titleText.textContent = '🎯 Daily Performance Metrics';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Tickets Today', 'Avg AHT', 'Quality Score', 'CSAT', 'FCR %'];
    } else if (_activeTrackingPage === 'shifts') {
        titleText.textContent = '🔄 Roster Schedules & Shift Swaps';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Shift', 'Shift Start', 'Shift End', 'Week Off Day'];
    } else if (_activeTrackingPage === 'leaves') {
        titleText.textContent = '🌿 Leave Logs';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Leave Type', 'Remarks'];
    } else if (_activeTrackingPage === 'breaks') {
        titleText.textContent = '☕ Break Duration Patterns';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Shift', 'Total Break (min)', 'Remarks'];
    } else if (_activeTrackingPage === 'errors') {
        titleText.textContent = '🔍 Error Patterns & Logs';
        headers = ['Date', 'Agent', 'Employee ID', 'Department', 'Error Category', 'Description', 'Count', 'Improvement Suggestion'];
    }

    head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    // Filter records if needed based on tab
    let records = [..._trackingAllRecords];
    if (_activeTrackingPage === 'leaves') {
        records = records.filter(r => r.status === 'leave');
    } else if (_activeTrackingPage === 'performance') {
        records = records.filter(r => ['present','work_from_home'].includes(r.status));
    } else if (_activeTrackingPage === 'errors') {
        // Flatten error subdocuments
        let errorRows = [];
        records.forEach(r => {
            if (r.errors?.length) {
                r.errors.forEach(e => {
                    errorRows.push({ ...r, errorCategory: e.category, errorDesc: e.description, errorCount: e.count, errorSuggestion: e.suggestion });
                });
            }
        });
        records = errorRows;
    }

    const total = records.length;
    const pages = Math.ceil(total / _trackingPageSize) || 1;
    const start = (_trackingPage - 1) * _trackingPageSize;
    const slice = records.slice(start, start + _trackingPageSize);

    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center;padding:30px;color:var(--clr-text-muted);">No records found matching filters.</td></tr>`;
        return;
    }

    body.innerHTML = slice.map(r => {
        let cols = [];
        const dateStr = new Date(r.date).toISOString().split('T')[0];
        
        if (_activeTrackingPage === 'attendance') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department,
                statusBadge(r.status), r.shift || '—', r.loginTime || '—', r.logoutTime || '—',
                r.loginHrs != null ? `${r.loginHrs.toFixed(1)} h` : '—',
                r.lateLogin != null ? `${r.lateLogin} min` : '—'
            ];
        } else if (_activeTrackingPage === 'performance') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department,
                r.tickets || 0, r.aht != null ? `${r.aht.toFixed(1)} min` : '—',
                r.qualityScore != null ? `${Math.round(r.qualityScore)}%` : '—',
                r.csat != null ? r.csat.toFixed(1) : '—',
                r.fcr != null ? `${Math.round(r.fcr)}%` : '—'
            ];
        } else if (_activeTrackingPage === 'shifts') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department,
                r.shift || '—', r.shiftStart || '—', r.shiftEnd || '—', r.weekOffDay || '—'
            ];
        } else if (_activeTrackingPage === 'leaves') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department,
                `<span class="badge badge-leave">${r.leaveType || 'Annual'}</span>`, r.remarks || '—'
            ];
        } else if (_activeTrackingPage === 'breaks') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department, r.shift || '—',
                r.totalBreakMins != null ? `${r.totalBreakMins} min` : '—', r.remarks || '—'
            ];
        } else if (_activeTrackingPage === 'errors') {
            cols = [
                dateStr, r.agentName, r.employeeId, r.department,
                `<span class="badge badge-absent">${r.errorCategory || 'Data Entry'}</span>`,
                r.errorDesc || '—', `${r.errorCount || 1}×`,
                r.errorSuggestion ? `<span style="color:var(--clr-blue);font-weight:600;">💡 ${r.errorSuggestion}</span>` : '—'
            ];
        }

        return `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    renderTrackingPagination(total, pages, start);
}

// ── Behavior logs table rendering ─────────────────────────
function renderBehaviorTable() {
    const head = document.getElementById('trackingTableHeader');
    const body = document.getElementById('trackingTableBody');
    const titleText = document.getElementById('tableTitleText');
    if (!body || !head) return;

    titleText.textContent = '⚠️ Behavior Issue Logs';
    const headers = ['Date', 'Agent', 'Issue Type', 'Severity', 'Notes'];
    head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    const total = _trackingAllRecords.length;
    const pages = Math.ceil(total / _trackingPageSize) || 1;
    const start = (_trackingPage - 1) * _trackingPageSize;
    const slice = _trackingAllRecords.slice(start, start + _trackingPageSize);

    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--clr-text-muted);">No behavior logs recorded.</td></tr>`;
        return;
    }

    const sevClr = { low: 'badge-wfh', medium: 'badge-leave', high: 'badge-absent', critical: 'badge-absent' };

    body.innerHTML = slice.map(b => `
        <tr>
            <td>${new Date(b.date).toISOString().split('T')[0]}</td>
            <td><strong>${b.agentName}</strong></td>
            <td>${b.type}</td>
            <td><span class="badge ${sevClr[b.severity]||'badge-leave'}">${b.severity}</span></td>
            <td>${b.note || '—'}</td>
        </tr>`).join('');

    renderTrackingPagination(total, pages, start);
}

// ── Teams table rendering ─────────────────────────────────
function renderTeamsTable() {
    const head = document.getElementById('trackingTableHeader');
    const body = document.getElementById('trackingTableBody');
    const titleText = document.getElementById('tableTitleText');
    if (!body || !head) return;

    titleText.textContent = '👥 Organization Teams & Team Leads';
    const headers = ['Team Name', 'Department', 'Assigned Team Lead'];
    head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    const total = _trackingAllRecords.length;
    const pages = Math.ceil(total / _trackingPageSize) || 1;
    const start = (_trackingPage - 1) * _trackingPageSize;
    const slice = _trackingAllRecords.slice(start, start + _trackingPageSize);

    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--clr-text-muted);">No teams registered.</td></tr>`;
        return;
    }

    body.innerHTML = slice.map(t => `
        <tr>
            <td><strong>🏢 ${t.name}</strong></td>
            <td>${t.department || '—'}</td>
            <td>${t.leadId?.displayName || t.leadId?.username || '<span style="color:var(--clr-text-muted);">No Lead Assigned</span>'}</td>
        </tr>`).join('');

    renderTrackingPagination(total, pages, start);
}

function renderTrackingPagination(total, pages, start) {
    const pag = document.getElementById('trackingPagination');
    if (!pag) return;
    pag.innerHTML = `
        <span class="page-info">Showing ${Math.min(start+1,total)}–${Math.min(start+_trackingPageSize,total)} of ${total}</span>
        <button class="page-btn" onclick="_trackingPage=Math.max(1,_trackingPage-1);reloadActiveTable();">‹</button>
        ${Array.from({length:Math.min(pages,5)},(_,i) => `
            <button class="page-btn ${i+1===_trackingPage?'active':''}" onclick="_trackingPage=${i+1};reloadActiveTable();">${i+1}</button>`).join('')}
        <button class="page-btn" onclick="_trackingPage=Math.min(${pages},_trackingPage+1);reloadActiveTable();">›</button>`;
}

function reloadActiveTable() {
    if (_activeTrackingPage === 'behavior') renderBehaviorTable();
    else if (_activeTrackingPage === 'teams') renderTeamsTable();
    else renderGenericTable();
}

function filterTrackingTable(query) {
    const q = query.toLowerCase();
    const table = document.getElementById('trackingDataTable');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

// ── Upload Panel Handlers ─────────────────────────────────
function handlePageFileDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('pageDropZone');
    if (zone) zone.style.borderColor = 'var(--clr-border)';
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) uploadPageFile(file);
}

function handlePageFileSelect(e) {
    const file = e.target.files[0];
    if (file) uploadPageFile(file);
}

async function uploadPageFile(file) {
    const progressDiv = document.getElementById('pageUploadProgress');
    const fill = document.getElementById('pageUploadProgressFill');
    const statusText = document.getElementById('pageUploadStatusText');
    const uploadType = document.getElementById('pageUploadType')?.value || 'full';
    
    if (progressDiv) progressDiv.style.display = 'block';
    if (fill) fill.style.width = '10%';
    if (statusText) statusText.textContent = `Reading ${file.name}...`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            if (fill) fill.style.width = '30%';
            if (statusText) statusText.textContent = `Parsing sheet columns...`;
            
            let rows = [];
            const data = e.target.result;
            
            if (file.name.endsWith('.csv')) {
                const lines = data.split(/\r?\n/);
                const headers = lines[0].split(',');
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const cols = lines[i].split(',');
                    const rowObj = {};
                    headers.forEach((h, idx) => {
                        rowObj[h.trim()] = cols[idx] ? cols[idx].trim() : '';
                    });
                    rows.push(rowObj);
                }
            } else {
                // xlsx
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                rows = XLSX.utils.sheet_to_json(sheet);
            }

            if (fill) fill.style.width = '60%';
            if (statusText) statusText.textContent = `Uploading ${rows.length} records to database...`;

            const res = await fetch('/performance/api/performance/bulk-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: uploadType,
                    sheetName: file.name,
                    rows: rows,
                    org: window.APP.org
                })
            });
            
            const result = await res.json();
            if (fill) fill.style.width = '100%';
            
            if (res.ok && result.successRows > 0) {
                statusText.innerHTML = `<span style="color:var(--clr-green);">✓ Success! Seeded ${result.successRows} records. ${result.failedRows} failed.</span>`;
                toast(`Successfully uploaded ${result.successRows} rows!`, 'success');
            } else {
                statusText.innerHTML = `<span style="color:var(--clr-red);">✕ Upload failed: ${result.errors?.[0]?.message || 'Invalid format'}</span>`;
                toast('Upload failed', 'error');
            }
        } catch (err) {
            if (statusText) statusText.innerHTML = `<span style="color:var(--clr-red);">Error parsing file: ${err.message}</span>`;
            toast('Failed to process file', 'error');
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

// ── Export Page Actions ───────────────────────────────────
function exportTrackingData(format) {
    const sects = ['attendance', 'performance', 'breaks']
        .filter(s => document.getElementById(`page_exp_${s}`)?.checked)
        .join(',');
    const q = buildQuery({ format, sections: sects });
    window.location.href = `/performance/api/performance/export/${format}${q}`;
    toast(`Downloading ${format.toUpperCase()} report…`, 'info');
}

async function generatePagePublicLink() {
    const sects = ['attendance', 'performance', 'breaks']
        .filter(s => document.getElementById(`page_exp_${s}`)?.checked)
        .join(',');
    const q = buildQuery({ sections: sects });
    try {
        const res = await api(`/api/performance/share/link${q}`, { method: 'POST' });
        if (res?.link) {
            const input = document.getElementById('pagePublicLinkInput');
            const copyBtn = document.getElementById('pageCopyLinkBtn');
            if (input) input.value = res.link;
            if (copyBtn) copyBtn.style.display = 'inline-flex';
            toast('Share link generated (expires in 7 days)', 'success');
        } else {
            toast('Failed to generate link', 'error');
        }
    } catch {
        toast('Error', 'error');
    }
}

function copyPageLink() {
    const input = document.getElementById('pagePublicLinkInput');
    if (input?.value) {
        navigator.clipboard.writeText(input.value)
            .then(() => toast('Link copied!', 'success'))
            .catch(() => toast('Clipboard error', 'error'));
    }
}

// ── Settings View Rendering ──────────────────────────────
function renderSettingsView(data) {
    const container = document.getElementById('settingsContainer');
    if (!container) return;
    
    // Store data globally
    window.KPI_SETTINGS_DATA = data;
    
    const role = window.APP.user.role;
    const isOrgEditable = ['admin', 'vendor'].includes(role);
    const org = data.orgDefaults || { attendanceTarget: 80, qualityTarget: 95, ahtTarget: 6.0, ticketsTarget: 300 };

    let html = `
    <!-- Card 1: Org Baseline Defaults -->
    <div class="card" style="padding:24px;display:flex;flex-direction:column;gap:16px;">
        <div class="card-header" style="border-bottom:1px solid var(--clr-border);padding-bottom:12px;">
            <div class="card-title" style="font-size:15px;display:flex;align-items:center;gap:8px;">🏢 Baseline Defaults</div>
            <div style="font-size:11px;color:var(--clr-text-muted);margin-top:4px;">Organization-wide target thresholds. Fallback when no team/agent override exists.</div>
        </div>
        <div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">ATTENDANCE (%)</label>
                <input type="number" id="org_attendance" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" value="${org.attendanceTarget}" ${isOrgEditable?'':'disabled'} />
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">QUALITY SCORE (%)</label>
                <input type="number" id="org_quality" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" value="${org.qualityTarget}" ${isOrgEditable?'':'disabled'} />
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">AHT (MINUTES)</label>
                <input type="number" id="org_aht" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" step="0.1" min="0" value="${org.ahtTarget}" ${isOrgEditable?'':'disabled'} />
            </div>
            <div class="form-group" style="margin-bottom:16px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">TICKETS PROCESSED</label>
                <input type="number" id="org_tickets" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" value="${org.ticketsTarget}" ${isOrgEditable?'':'disabled'} />
            </div>
            ${isOrgEditable ? `<button class="btn btn-primary" onclick="saveTarget('org')" style="width:100%;justify-content:center;">✓ Save Defaults</button>` : `<span style="font-size:11px;color:var(--clr-text-muted);display:block;text-align:center;">Read-only for Team Leads</span>`}
        </div>
    </div>

    <!-- Card 2: Team Custom Overrides -->
    <div class="card" style="padding:24px;display:flex;flex-direction:column;gap:16px;">
        <div class="card-header" style="border-bottom:1px solid var(--clr-border);padding-bottom:12px;">
            <div class="card-title" style="font-size:15px;display:flex;align-items:center;gap:8px;">👥 Team Custom Targets</div>
            <div style="font-size:11px;color:var(--clr-text-muted);margin-top:4px;">Override thresholds for a specific team. Fallback for all team members.</div>
        </div>
        <div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">SELECT TEAM</label>
                <select id="team_selector" class="form-select" style="width:100%;padding:8px;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);border-radius:6px;" onchange="onTeamSelectChange(this.value)">
                    <option value="">-- Choose Team --</option>
                    ${(data.teams || []).map(t => `<option value="${t._id}">${t.name}</option>`).join('')}
                </select>
            </div>
            <div id="team_override_checkbox_container" style="display:none;margin-bottom:12px;align-items:center;gap:8px;margin-top:12px;">
                <input type="checkbox" id="team_override" onchange="toggleTeamOverride(this.checked)" style="width:16px;height:16px;cursor:pointer;" />
                <label for="team_override" style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;cursor:pointer;margin:0;">OVERRIDE ACTIVE</label>
            </div>
            <div id="team_fields" style="display:none;border-top:1px dashed var(--clr-border);padding-top:12px;margin-top:12px;">
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">ATTENDANCE (%)</label>
                    <input type="number" id="team_attendance" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" />
                </div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">QUALITY SCORE (%)</label>
                    <input type="number" id="team_quality" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" />
                </div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">AHT (MINUTES)</label>
                    <input type="number" id="team_aht" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" step="0.1" min="0" />
                </div>
                <div class="form-group" style="margin-bottom:16px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">TICKETS PROCESSED</label>
                    <input type="number" id="team_tickets" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" />
                </div>
            </div>
            <button class="btn btn-primary" id="btn_save_team" onclick="saveTarget('team')" style="width:100%;justify-content:center;display:none;margin-top:12px;">✓ Save Team Targets</button>
        </div>
    </div>

    <!-- Card 3: Agent Custom Overrides -->
    <div class="card" style="padding:24px;display:flex;flex-direction:column;gap:16px;">
        <div class="card-header" style="border-bottom:1px solid var(--clr-border);padding-bottom:12px;">
            <div class="card-title" style="font-size:15px;display:flex;align-items:center;gap:8px;">👤 Agent Custom Targets</div>
            <div style="font-size:11px;color:var(--clr-text-muted);margin-top:4px;">Set customized target values for a specific individual agent.</div>
        </div>
        <div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">SELECT AGENT</label>
                <select id="agent_selector" class="form-select" style="width:100%;padding:8px;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);border-radius:6px;" onchange="onAgentSelectChange(this.value)">
                    <option value="">-- Choose Agent --</option>
                    ${(data.agents || []).map(a => `<option value="${a._id}">${a.displayName} (${a.employeeId || 'no ID'})</option>`).join('')}
                </select>
            </div>
            <div id="agent_override_checkbox_container" style="display:none;margin-bottom:12px;align-items:center;gap:8px;margin-top:12px;">
                <input type="checkbox" id="agent_override" onchange="toggleAgentOverride(this.checked)" style="width:16px;height:16px;cursor:pointer;" />
                <label for="agent_override" style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;cursor:pointer;margin:0;">OVERRIDE ACTIVE</label>
            </div>
            <div id="agent_fields" style="display:none;border-top:1px dashed var(--clr-border);padding-top:12px;margin-top:12px;">
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">ATTENDANCE (%)</label>
                    <input type="number" id="agent_attendance" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" />
                </div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">QUALITY SCORE (%)</label>
                    <input type="number" id="agent_quality" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" max="100" />
                </div>
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">AHT (MINUTES)</label>
                    <input type="number" id="agent_aht" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" step="0.1" min="0" />
                </div>
                <div class="form-group" style="margin-bottom:16px;">
                    <label style="font-size:11px;color:var(--clr-text-secondary);font-weight:600;display:block;margin-bottom:6px;">TICKETS PROCESSED</label>
                    <input type="number" id="agent_tickets" class="form-control" style="width:100%;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text-primary);padding:8px;border-radius:6px;" min="0" />
                </div>
            </div>
            <button class="btn btn-primary" id="btn_save_agent" onclick="saveTarget('agent')" style="width:100%;justify-content:center;display:none;margin-top:12px;">✓ Save Agent Targets</button>
        </div>
    </div>`;

    container.innerHTML = html;
}

function onTeamSelectChange(teamId) {
    const container = document.getElementById('team_override_checkbox_container');
    const fields = document.getElementById('team_fields');
    const saveBtn = document.getElementById('btn_save_team');
    const chk = document.getElementById('team_override');
    
    if (!teamId) {
        if (container) container.style.display = 'none';
        if (fields) fields.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    saveBtn.style.display = 'inline-flex';

    // Find if targets exist for this team
    const team = window.KPI_SETTINGS_DATA.teams.find(t => t._id === teamId);
    if (team && team.targets) {
        chk.checked = true;
        fields.style.display = 'block';
        document.getElementById('team_attendance').value = team.targets.attendanceTarget ?? 80;
        document.getElementById('team_quality').value = team.targets.qualityTarget ?? 95;
        document.getElementById('team_aht').value = team.targets.ahtTarget ?? 6.0;
        document.getElementById('team_tickets').value = team.targets.ticketsTarget ?? 300;
    } else {
        chk.checked = false;
        fields.style.display = 'none';
        document.getElementById('team_attendance').value = '';
        document.getElementById('team_quality').value = '';
        document.getElementById('team_aht').value = '';
        document.getElementById('team_tickets').value = '';
    }
}

function toggleTeamOverride(checked) {
    const fields = document.getElementById('team_fields');
    if (fields) fields.style.display = checked ? 'block' : 'none';
}

function onAgentSelectChange(userId) {
    const container = document.getElementById('agent_override_checkbox_container');
    const fields = document.getElementById('agent_fields');
    const saveBtn = document.getElementById('btn_save_agent');
    const chk = document.getElementById('agent_override');
    
    if (!userId) {
        if (container) container.style.display = 'none';
        if (fields) fields.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    saveBtn.style.display = 'inline-flex';

    const agent = window.KPI_SETTINGS_DATA.agents.find(a => a._id === userId);
    if (agent && agent.targets) {
        chk.checked = true;
        fields.style.display = 'block';
        document.getElementById('agent_attendance').value = agent.targets.attendanceTarget ?? 80;
        document.getElementById('agent_quality').value = agent.targets.qualityTarget ?? 95;
        document.getElementById('agent_aht').value = agent.targets.ahtTarget ?? 6.0;
        document.getElementById('agent_tickets').value = agent.targets.ticketsTarget ?? 300;
    } else {
        chk.checked = false;
        fields.style.display = 'none';
        document.getElementById('agent_attendance').value = '';
        document.getElementById('agent_quality').value = '';
        document.getElementById('agent_aht').value = '';
        document.getElementById('agent_tickets').value = '';
    }
}

function toggleAgentOverride(checked) {
    const fields = document.getElementById('agent_fields');
    if (fields) fields.style.display = checked ? 'block' : 'none';
}

async function saveTarget(scope) {
    let teamId = null;
    let userId = null;
    let payload = { scope };

    if (scope === 'org') {
        payload.attendanceTarget = document.getElementById('org_attendance').value;
        payload.qualityTarget = document.getElementById('org_quality').value;
        payload.ahtTarget = document.getElementById('org_aht').value;
        payload.ticketsTarget = document.getElementById('org_tickets').value;
    } else if (scope === 'team') {
        teamId = document.getElementById('team_selector').value;
        if (!teamId) return toast('Please select a team', 'error');
        payload.teamId = teamId;
        const override = document.getElementById('team_override').checked;
        if (override) {
            payload.attendanceTarget = document.getElementById('team_attendance').value;
            payload.qualityTarget = document.getElementById('team_quality').value;
            payload.ahtTarget = document.getElementById('team_aht').value;
            payload.ticketsTarget = document.getElementById('team_tickets').value;
        } else {
            payload.attendanceTarget = null;
            payload.qualityTarget = null;
            payload.ahtTarget = null;
            payload.ticketsTarget = null;
        }
    } else if (scope === 'agent') {
        userId = document.getElementById('agent_selector').value;
        if (!userId) return toast('Please select an agent', 'error');
        const agent = window.KPI_SETTINGS_DATA.agents.find(a => a._id === userId);
        payload.userId = userId;
        payload.teamId = agent?.teamId || null;
        
        const override = document.getElementById('agent_override').checked;
        if (override) {
            payload.attendanceTarget = document.getElementById('agent_attendance').value;
            payload.qualityTarget = document.getElementById('agent_quality').value;
            payload.ahtTarget = document.getElementById('agent_aht').value;
            payload.ticketsTarget = document.getElementById('agent_tickets').value;
        } else {
            payload.attendanceTarget = null;
            payload.qualityTarget = null;
            payload.ahtTarget = null;
            payload.ticketsTarget = null;
        }
    }

    try {
        const res = await fetch('/performance/api/performance/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok && result.success) {
            toast('Settings saved successfully!', 'success');
            // Reload settings
            const data = await api('/api/performance/settings');
            window.KPI_SETTINGS_DATA = data;
            // Refresh fields view
            if (scope === 'team') onTeamSelectChange(teamId);
            if (scope === 'agent') onAgentSelectChange(userId);
        } else {
            toast(result.error || 'Failed to save settings', 'error');
        }
    } catch (e) {
        console.error('Error saving settings:', e);
        toast('Error saving settings', 'error');
    }
}

/* ─────────────────────────────────────────────────────────
   NEW: BREAK RECORDER VIEW HANDLERS
   ───────────────────────────────────────────────────────── */
let _breakRecorderUsers = [];

async function loadBreakRecorderUsers() {
    const role = window.APP.user.role;
    let dept = '';
    
    if (role === 'team_lead') {
        dept = window.APP.user.department;
        const container = document.getElementById('deptFilterContainer');
        if (container) container.style.display = 'none';
    } else {
        // Admin or Vendor: show department filter
        const container = document.getElementById('deptFilterContainer');
        if (container) container.style.display = 'block';
        
        const filterSelect = document.getElementById('breakDeptFilter');
        if (filterSelect) {
            if (!filterSelect.options.length) {
                // Fetch departments
                const depts = await api('/api/admin/departments') || [];
                filterSelect.innerHTML = depts.map(d => `<option value="${d.slug}">${d.name}</option>`).join('');
                const defaultDept = window.APP.user.department || (depts[0] && depts[0].slug) || 'zomato';
                filterSelect.value = defaultDept;
            }
            dept = filterSelect.value;
        }
    }
    
    if (!dept) {
        dept = 'zomato';
    }

    const tbody = document.getElementById('breakRecorderTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--clr-text-muted);">Loading agents for ${dept}…</td></tr>`;
    }

    try {
        const url = `/performance/api/performance/break-recorder/users?dept=${encodeURIComponent(dept)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        _breakRecorderUsers = data || [];
        
        const selectAllCheckbox = document.getElementById('breakSelectAll');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        filterBreakRecorderTable();
    } catch (err) {
        console.error('Error fetching break recorder users:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--clr-red);">Failed to load agents: ${err.message}</td></tr>`;
        }
    }
}

function filterBreakRecorderTable() {
    const searchVal = (document.getElementById('breakSearchInput')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('breakRecorderTableBody');
    if (!tbody) return;

    const filtered = _breakRecorderUsers.filter(u => {
        const name = (u.displayName || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        const empId = (u.employeeId || '').toLowerCase();
        return name.includes(searchVal) || username.includes(searchVal) || empId.includes(searchVal);
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--clr-text-muted);">No agents found.</td></tr>`;
        updateSelectedBreaksCount();
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const statusBadge = u.isOnBreak 
            ? `<span class="badge" style="background:var(--clr-red);color:white;padding:4px 8px;border-radius:4px;font-weight:500;">On Break</span>` 
            : `<span class="badge" style="background:var(--clr-green);color:white;padding:4px 8px;border-radius:4px;font-weight:500;">Available</span>`;
            
        const breakStart = u.isOnBreak && u.breakStartTime ? u.breakStartTime : '—';
        const btnText = u.isOnBreak ? 'Punch Out' : 'Punch In';
        const btnClass = u.isOnBreak ? 'btn-ghost' : 'btn-primary';

        return `
        <tr data-user-id="${u._id}">
            <td style="text-align:center;vertical-align:middle;">
                <input type="checkbox" class="agent-break-checkbox" value="${u._id}" onchange="updateSelectedBreaksCount()" style="cursor:pointer;" />
            </td>
            <td style="font-weight:500;color:var(--clr-text-main);">${u.displayName || u.username}</td>
            <td style="color:var(--clr-text-secondary);font-family:monospace;">${u.employeeId || '—'}</td>
            <td>${statusBadge}</td>
            <td style="color:var(--clr-text-secondary);">${breakStart}</td>
            <td style="text-align:right;">
                <button class="btn ${btnClass} btn-sm" onclick="toggleAgentBreakSingle('${u._id}')">${btnText}</button>
            </td>
        </tr>`;
    }).join('');

    updateSelectedBreaksCount();
}

function toggleSelectAllBreaks(checked) {
    const checkboxes = document.querySelectorAll('.agent-break-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
    updateSelectedBreaksCount();
}

function updateSelectedBreaksCount() {
    const checkboxes = document.querySelectorAll('.agent-break-checkbox:checked');
    const count = checkboxes.length;
    const bannerCountText = document.getElementById('selectedCountText');
    if (bannerCountText) {
        bannerCountText.textContent = `${count} agent${count !== 1 ? 's' : ''} selected`;
    }
    const bulkBtn = document.getElementById('bulkToggleBreakBtn');
    if (bulkBtn) {
        bulkBtn.disabled = count === 0;
    }
}

async function toggleAgentBreakSingle(userId) {
    await performBreaksToggle([userId]);
}

async function bulkToggleBreaks() {
    const checkboxes = document.querySelectorAll('.agent-break-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);
    if (!ids.length) return;
    
    if (confirm(`Are you sure you want to toggle the break status for ${ids.length} selected agent(s)?`)) {
        await performBreaksToggle(ids);
    }
}

async function performBreaksToggle(userIds) {
    toast(`Updating break status for ${userIds.length} agent(s)...`, 'info');
    try {
        const res = await fetch('/performance/api/performance/break-recorder/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            toast(data.message || 'Status updated successfully', 'success');
            await loadBreakRecorderUsers();
        } else {
            toast(data.error || 'Failed to update break status', 'error');
        }
    } catch (err) {
        console.error('Toggle breaks error:', err);
        toast('Connection error: ' + err.message, 'error');
    }
}

// Global load hook bound to refresh action
window.loadTrackingPageData = loadTrackingPageData;
