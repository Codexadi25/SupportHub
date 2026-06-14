/* charts.js — Chart.js chart builders (Power BI dark style) */

/* ── Global Chart.js defaults ────────────────────────────── */
Chart.defaults.color           = '#8891a8';
Chart.defaults.borderColor     = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family     = "'DM Sans', sans-serif";
Chart.defaults.font.size       = 11;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#1a1e2a';
Chart.defaults.plugins.tooltip.borderColor      = 'rgba(255,255,255,0.1)';
Chart.defaults.plugins.tooltip.borderWidth      = 1;
Chart.defaults.plugins.tooltip.titleColor       = '#f0f2f8';
Chart.defaults.plugins.tooltip.bodyColor        = '#8891a8';
Chart.defaults.plugins.tooltip.padding          = 10;
Chart.defaults.plugins.tooltip.cornerRadius     = 8;
Chart.defaults.animation.duration               = 600;
Chart.defaults.animation.easing                 = 'easeInOutQuart';

const C = {
    blue:   '#3b7eff', cyan:   '#00d4ff', green:  '#00e5a0',
    amber:  '#ffb340', red:    '#ff4d6a', purple: '#a78bfa', teal: '#2dd4bf',
    blueDim: 'rgba(59,126,255,0.15)', greenDim: 'rgba(0,229,160,0.15)',
    redDim:  'rgba(255,77,106,0.15)', amberDim: 'rgba(255,179,64,0.15)',
    purpleDim:'rgba(167,139,250,0.15)'
};

const _charts = {};

function mkChart(id, config) {
    if (_charts[id]) _charts[id].destroy();
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    _charts[id] = new Chart(canvas, config);
    return _charts[id];
}

function updateChart(id, labels, datasets) {
    const ch = _charts[id];
    if (!ch) return;
    ch.data.labels = labels;
    ch.data.datasets = datasets;
    ch.update('active');
}

/* ── Gradient helper ─────────────────────────────────────── */
function grad(ctx, color, alpha1 = 0.4, alpha2 = 0) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, color.replace(')', `,${alpha1})`).replace('rgb', 'rgba'));
    g.addColorStop(1, color.replace(')', `,${alpha2})`).replace('rgb', 'rgba'));
    return g;
}

/* ── 1. Attendance Trend ─────────────────────────────────── */
function buildAttendanceTrend(labels, present, absent, leave) {
    return mkChart('attendanceTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Present', data: present, borderColor: C.green,  backgroundColor: C.greenDim,  borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 },
                { label: 'Absent',  data: absent,  borderColor: C.red,    backgroundColor: C.redDim,    borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 },
                { label: 'Leave',   data: leave,   borderColor: C.amber,  backgroundColor: C.amberDim,  borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: { boxWidth: 10, boxHeight: 10, color: '#8891a8', font: { size: 11 } }
                }
            }
        }
    });
}

/* ── 2. Attendance Donut ─────────────────────────────────── */
function buildAttendanceDonut(counts) {
    const labels = Object.keys(counts);
    const data   = Object.values(counts);
    const palette = [C.green, C.red, C.amber, C.purple, C.blue, C.teal];
    return mkChart('attendanceDonutChart', {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: palette, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}` } }
            }
        }
    });
}

/* ── 3. Performance Trend ────────────────────────────────── */
function buildPerformanceTrend(labels, quality, aht, csat) {
    return mkChart('performanceTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Quality',  data: quality, borderColor: C.green,  borderWidth: 2, tension: 0.4, pointRadius: 3, fill: false },
                { label: 'Avg AHT',  data: aht,     borderColor: C.amber,  borderWidth: 2, tension: 0.4, pointRadius: 3, fill: false, yAxisID: 'y2' },
                { label: 'CSAT',     data: csat,     borderColor: C.blue,   borderWidth: 2, tension: 0.4, pointRadius: 3, fill: false },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false } },
                y:  { position: 'left',  min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' } },
                y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: C.amber } }
            },
            plugins: { legend: { display: true, labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } } } }
        }
    });
}

/* ── 4. Ticket Volume ────────────────────────────────────── */
function buildTicketVolume(labels, data) {
    return mkChart('ticketVolumeChart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Tickets',
                data,
                borderColor: C.blue,
                backgroundColor: C.blueDim,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
            }
        }
    });
}

/* ── 5. AHT Distribution ─────────────────────────────────── */
function buildAHT(agents, ahtValues, avg) {
    return mkChart('ahtChart', {
        type: 'line',
        data: {
            labels: agents,
            datasets: [
                {
                    label: 'Agent AHT',
                    data: ahtValues,
                    borderColor: C.blue,
                    backgroundColor: C.blueDim,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                },
                {
                    label: 'Team Avg',
                    data: Array(agents.length).fill(avg),
                    borderColor: C.amber,
                    borderDash: [4,3],
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { grid: { display: false }, ticks: { maxRotation: 45 } }, y: { beginAtZero: true } },
            plugins: { legend: { display: true, labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } } } }
        }
    });
}

/* ── 6. Break Pattern ────────────────────────────────────── */
function buildBreakPattern(hours, avgMins, shiftCount) {
    return mkChart('breakPatternChart', {
        type: 'line',
        data: {
            labels: hours.map(h => `${String(h).padStart(2,'0')}:00`),
            datasets: [
                {
                    label: 'Avg Break (min)',
                    data: avgMins,
                    borderColor: C.purple,
                    backgroundColor: C.purpleDim,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    yAxisID: 'y'
                },
                {
                    label: 'Shift Gauge (Active Agents)',
                    data: shiftCount || Array(24).fill(0),
                    borderColor: C.blue,
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    yAxisID: 'yShift'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: '#8891a8', font: { size: 9 } } },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    title: { display: true, text: 'Break Duration (mins)', color: C.purple, font: { size: 10, weight: 'bold' } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#8891a8' }
                },
                yShift: {
                    beginAtZero: true,
                    position: 'right',
                    title: { display: true, text: 'Scheduled Agents', color: C.blue, font: { size: 10, weight: 'bold' } },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#8891a8' }
                }
            },
            plugins: {
                legend: { display: true, labels: { color: '#8891a8', font: { size: 10 } } }
            }
        }
    });
}

/* ── 7. Week Off Chart ───────────────────────────────────── */
function buildWeekOff(days, counts) {
    return mkChart('weekOffChart', {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Week Off Count',
                data: counts,
                borderColor: C.cyan,
                backgroundColor: 'rgba(6,182,212,0.15)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

/* ── 8. Punctuality Chart ────────────────────────────────── */
function buildPunctuality(agents, lateData, earlyData) {
    return mkChart('punctualityChart', {
        type: 'line',
        data: {
            labels: agents,
            datasets: [
                {
                    label: 'Late Login (min)',
                    data: lateData,
                    borderColor: C.amber,
                    backgroundColor: C.amberDim,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                },
                {
                    label: 'Early Logout (min)',
                    data: earlyData,
                    borderColor: C.red,
                    backgroundColor: C.redDim,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
                y: { beginAtZero: true }
            },
            plugins: { legend: { display: true, labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } } } }
        }
    });
}

/* ── 9. Error Pattern ────────────────────────────────────── */
function buildErrorPattern(categories, counts) {
    const palette = [C.red, C.amber, C.blue, C.purple, C.teal, C.cyan, C.green];
    return mkChart('errorPatternChart', {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: counts,
                backgroundColor: palette.slice(0, categories.length),
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } }
                },
                tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}` } }
            }
        }
    });
}

/* ── 10. POLYGON / RADAR — Employee Performance ───────────── */
function buildPerformanceRadar(empData, teamAvg) {
    const labels = ['Attendance', 'Quality', 'AHT Eff.', 'Tickets', 'Punctuality', 'CSAT', 'FCR', 'Behavior'];
    return mkChart('performanceRadar', {
        type: 'radar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Employee',
                    data: empData,
                    borderColor: C.blue,
                    backgroundColor: 'rgba(59,126,255,0.15)',
                    borderWidth: 2,
                    pointBackgroundColor: C.blue,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Team Avg',
                    data: teamAvg,
                    borderColor: C.green,
                    backgroundColor: 'rgba(0,229,160,0.08)',
                    borderWidth: 1.5,
                    borderDash: [4, 3],
                    pointBackgroundColor: C.green,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { stepSize: 20, backdropColor: 'transparent', color: '#4d5568', font: { size: 9 } },
                    grid: { color: 'rgba(255,255,255,0.07)' },
                    angleLines: { color: 'rgba(255,255,255,0.07)' },
                    pointLabels: { color: '#8891a8', font: { size: 10, family: "'DM Sans'" } }
                }
            },
            plugins: {
                legend: { display: true, labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.dataset.label}: ${c.raw}`
                    }
                }
            }
        }
    });
}

/* ── 11. Employee Performance Trend ──────────────────────── */
function buildEmpPerformanceTrend(labels, quality, aht) {
    return mkChart('empPerformanceTrend', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Quality', data: quality, borderColor: C.green, borderWidth: 2, tension: 0.4, fill: false, pointRadius: 3 },
                { label: 'AHT',     data: aht,     borderColor: C.amber, borderWidth: 2, tension: 0.4, fill: false, pointRadius: 3, yAxisID: 'y2' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false } },
                y:  { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' } },
                y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: C.amber } }
            },
            plugins: { legend: { display: true, labels: { boxWidth: 10, color: '#8891a8', font: { size: 11 } } } }
        }
    });
}

/* ── 12. Employee Break Pattern ──────────────────────────── */
function buildEmpBreakPattern(hours, mins, shiftCount) {
    return mkChart('empBreakPattern', {
        type: 'line',
        data: {
            labels: hours.map(h => `${String(h).padStart(2,'0')}:00`),
            datasets: [
                {
                    label: 'Avg Break (min)',
                    data: mins,
                    borderColor: C.purple,
                    backgroundColor: C.purpleDim,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    yAxisID: 'y'
                },
                {
                    label: 'Shift Gauge (Days Scheduled)',
                    data: shiftCount || Array(24).fill(0),
                    borderColor: C.blue,
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    yAxisID: 'yShift'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: '#8891a8', font: { size: 9 } } },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    title: { display: true, text: 'Break Duration (mins)', color: C.purple, font: { size: 10, weight: 'bold' } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#8891a8' }
                },
                yShift: {
                    beginAtZero: true,
                    position: 'right',
                    title: { display: true, text: 'Active Shifts (Days)', color: C.blue, font: { size: 10, weight: 'bold' } },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#8891a8' }
                }
            },
            plugins: {
                legend: { display: true, labels: { color: '#8891a8', font: { size: 10 } } }
            }
        }
    });
}

/* ── Login Heatmap ───────────────────────────────────────── */
function buildLoginHeatmap(containerId, data) {
    // data: 2D array [weekday][hour] = count
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const hours = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}:00`);
    const container = document.getElementById(containerId);
    if (!container) return;

    const maxVal = Math.max(...data.flat(), 1);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:40px repeat(24,1fr);gap:2px;font-size:9px;height:100%;align-content:start;';

    // Header row
    grid.appendChild(Object.assign(document.createElement('div'), { textContent: '' }));
    hours.forEach(h => {
        const el = document.createElement('div');
        el.textContent = h.split(':')[0];
        el.style.cssText = 'text-align:center;color:#4d5568;';
        grid.appendChild(el);
    });

    // Data rows
    days.forEach((day, di) => {
        const label = Object.assign(document.createElement('div'), { textContent: day });
        label.style.cssText = 'color:#8891a8;display:flex;align-items:center;';
        grid.appendChild(label);

        for (let h = 0; h < 24; h++) {
            const val = (data[di] || [])[h] || 0;
            const lvl = val === 0 ? 0 : Math.ceil((val / maxVal) * 4);
            const cell = document.createElement('div');
            cell.setAttribute('data-level', lvl);
            cell.setAttribute('title', `${day} ${hours[h]}: ${val} logins`);
            cell.style.cssText = `height:18px;border-radius:2px;cursor:pointer;`;
            const alpha = lvl * 0.2;
            cell.style.background = `rgba(59,126,255,${alpha})`;
            grid.appendChild(cell);
        }
    });

    container.innerHTML = '';
    container.appendChild(grid);
}
