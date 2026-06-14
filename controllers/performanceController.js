// controllers/performanceController.js
const mongoose         = require('mongoose');
const PerformanceRecord = require('../models/PerformanceRecord');
const SharedReport = require('../models/SharedReport');
const UploadBatch      = require('../models/UploadBatch');
const User             = require('../models/User');
const Team             = require('../models/Team');
const KpiTarget        = require('../models/KpiTarget');
const ExcelJS          = require('exceljs');
const { nanoid }       = require('nanoid');
const crypto           = require('crypto');
const seeder           = require('../utils/demoSeeder');

/* ─────────────────────────────────────────────────────────
   HELPER — build the mongoose filter from req.query
   ───────────────────────────────────────────────────────── */
function buildFilter(req) {
    const { from, to, dept, team } = req.query;
    const filter = { organization: req.orgScope };

    // team_lead sees only their team
    if (req.teamScope) filter.teamId = req.teamScope;
    else if (team)     filter.teamId = team;

    if (dept) filter.department = dept.toLowerCase();

    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to)   filter.date.$lte = new Date(to + 'T23:59:59');
    }
    return filter;
}

/* ─────────────────────────────────────────────────────────
   HELPER — resolve KPI targets for a scope (Agent -> Team -> Org -> System Default)
   ───────────────────────────────────────────────────────── */
async function resolveTargets(org, teamId = null, userId = null) {
    const sysDefaults = { attendanceTarget: 80, qualityTarget: 95, ahtTarget: 6.0, ticketsTarget: 300 };
    try {
        let target = null;
        
        // 1. Check user-level target
        if (userId) {
            target = await KpiTarget.findOne({ organization: org, userId }).lean();
            if (target) return {
                attendanceTarget: target.attendanceTarget ?? sysDefaults.attendanceTarget,
                qualityTarget:    target.qualityTarget ?? sysDefaults.qualityTarget,
                ahtTarget:        target.ahtTarget ?? sysDefaults.ahtTarget,
                ticketsTarget:    target.ticketsTarget ?? sysDefaults.ticketsTarget
            };
        }

        // 2. Check team-level target
        if (teamId) {
            target = await KpiTarget.findOne({ organization: org, teamId, userId: null }).lean();
            if (target) return {
                attendanceTarget: target.attendanceTarget ?? sysDefaults.attendanceTarget,
                qualityTarget:    target.qualityTarget ?? sysDefaults.qualityTarget,
                ahtTarget:        target.ahtTarget ?? sysDefaults.ahtTarget,
                ticketsTarget:    target.ticketsTarget ?? sysDefaults.ticketsTarget
            };
        }

        // 3. Check org-level target
        target = await KpiTarget.findOne({ organization: org, teamId: null, userId: null }).lean();
        if (target) return {
            attendanceTarget: target.attendanceTarget ?? sysDefaults.attendanceTarget,
            qualityTarget:    target.qualityTarget ?? sysDefaults.qualityTarget,
            ahtTarget:        target.ahtTarget ?? sysDefaults.ahtTarget,
            ticketsTarget:    target.ticketsTarget ?? sysDefaults.ticketsTarget
        };

        return sysDefaults;
    } catch (e) {
        console.error('Error resolving targets:', e);
        return sysDefaults;
    }
}

async function getTeamsAndDepts(org) {
    try {
        // 1. Find all active team leads in this org
        const teamLeads = await User.find({ organization: org, role: 'team_lead', isActive: true });

        // 2. Ensure each active team lead has a Team
        for (const tl of teamLeads) {
            let teamObj = await Team.findOne({ teamLeadId: tl._id, organization: org });
            if (!teamObj) {
                teamObj = new Team({
                    name: (tl.displayName || tl.username) + ' Team',
                    teamLeadId: tl._id,
                    organization: org,
                    department: tl.department || 'general',
                    isActive: true
                });
                await teamObj.save();
            } else if (!teamObj.isActive) {
                teamObj.isActive = true;
                await teamObj.save();
            }
        }

        // 3. Deactivate teams whose TL is no longer team_lead or active
        const activeTlIds = teamLeads.map(tl => tl._id);
        await Team.updateMany(
            { organization: org, teamLeadId: { $nin: activeTlIds, $ne: null }, isActive: true },
            { isActive: false }
        );
    } catch (err) {
        console.error('[Team Sync] Warning: failed to auto-sync teams:', err.message);
    }

    const teams = await Team.find({ organization: org, isActive: true })
        .populate('teamLeadId', 'displayName username')
        .lean();

    teams.forEach(t => {
        if (t.teamLeadId) {
            t.name = (t.teamLeadId.displayName || t.teamLeadId.username) + ' Team';
        }
    });

    const depts = await User.distinct('department', { organization: org, isActive: true });
    return { teams, departments: depts.filter(Boolean) };
}

/* ─────────────────────────────────────────────────────────
   VIEW CONTROLLERS
   ───────────────────────────────────────────────────────── */
async function viewDashboard(req, res) {
    try {
        const { teams, departments } = await getTeamsAndDepts(req.orgScope);
        const behaviorCount = await PerformanceRecord.countDocuments({
            organization: req.orgScope,
            'behaviorIssues.0': { $exists: true },
            date: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
        });
        res.render('performanceDashboard', {
            title: 'Performance Dashboard — PulseTrack',
            user: req.user,
            currentPage: 'dashboard',
            org: req.orgScope,
            teams, departments,
            behaviorCount,
            filters: req.query
        }, (err, html) => {
            if (err) return res.status(500).send(err.message);
            res.render('performanceLayout', {
                body: html,
                title: 'Performance Dashboard — PulseTrack',
                user: req.user,
                currentPage: 'dashboard',
                org: req.orgScope,
                teams, departments,
                behaviorCount,
                filters: req.query
            });
        });
    } catch (e) { res.status(500).send(e.message); }
}

async function viewEmployee(req, res) {
    try {
        const { teams, departments } = await getTeamsAndDepts(req.orgScope);
        const employeesQuery = { organization: req.orgScope, isActive: true, role: { $in: ['user','editor','quality_analyst'] } };
        if (req.teamScope) employeesQuery.teamId = req.teamScope;
        const employees = await User.find(employeesQuery).select('username displayName employeeId _id').lean();
        res.render('performanceEmployee', {
            title: 'Employee Profile — PulseTrack',
            user: req.user, currentPage: 'employee',
            org: req.orgScope, teams, departments,
            employees, empId: req.query.id || '',
            filters: req.query, behaviorCount: 0
        }, (err, html) => {
            if (err) return res.status(500).send(err.message);
            res.render('performanceLayout', {
                body: html,
                title: 'Employee Profile — PulseTrack',
                user: req.user, currentPage: 'employee',
                org: req.orgScope, teams, departments,
                filters: req.query, behaviorCount: 0
            });
        });
    } catch (e) { res.status(500).send(e.message); }
}

// Generic view stub for other pages
function makeView(page, title) {
    return async (req, res) => {
        try {
            const { teams, departments } = await getTeamsAndDepts(req.orgScope);
            res.render('performanceLayout', {
                body: `<div class="tracking-page-container" data-page="${page}" data-title="${title}"></div>`,
                title: `${title} — PulseTrack`,
                user: req.user, currentPage: page,
                org: req.orgScope, teams, departments,
                filters: req.query, behaviorCount: 0
            });
        } catch (e) { res.status(500).send(e.message); }
    };
}
const viewOverview    = makeView('overview',    'Team Overview');
const viewRecords     = makeView('attendance',  'Attendance Records');
const viewPerformance = makeView('performance', 'Performance');
const viewShifts      = makeView('shifts',      'Shifts & Swaps');
const viewLeaves      = makeView('leaves',      'Leave Tracker');
const viewBreaks      = makeView('breaks',      'Break Patterns');
const viewBehavior    = makeView('behavior',    'Behavior Issues');
const viewErrors      = makeView('errors',      'Error Patterns');
const viewTrends      = makeView('trends',      'Trends');
const viewUpload      = makeView('upload',      'Upload Data');
const viewExport      = makeView('export',      'Export & Share');
const viewTeams       = makeView('teams',       'Teams');
const viewSettings    = makeView('settings',    'Settings');

/* ─────────────────────────────────────────────────────────
   API: SUMMARY / KPIs
   ───────────────────────────────────────────────────────── */
async function apiSummary(req, res) {
    try {
        const filter = buildFilter(req);
        const todayFilter = { ...filter, date: { $gte: new Date(new Date().setHours(0,0,0,0)) } };

        const [statusAgg, metrics] = await Promise.all([
            PerformanceRecord.aggregate([
                { $match: todayFilter },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            PerformanceRecord.aggregate([
                { $match: filter },
                { $group: {
                    _id: null,
                    avgAHT:        { $avg: '$aht' },
                    avgQuality:    { $avg: '$qualityScore' },
                    totalTickets:  { $sum: '$ticketsProcessed' },
                    lateCount:     { $sum: { $cond: ['$isLateLogin', 1, 0] } },
                    behaviorCount: { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
                }}
            ])
        ]);

        const statusBreakdown = {};
        let presentCount = 0, absentCount = 0, leaveCount = 0;
        statusAgg.forEach(s => {
            statusBreakdown[s._id] = s.count;
            if (s._id === 'present') presentCount = s.count;
            if (s._id === 'absent')  absentCount  = s.count;
            if (s._id === 'leave')   leaveCount   = s.count;
        });

        const m = metrics[0] || {};
        const teamId = filter.teamId || req.teamScope || req.query.team || null;
        const userId = req.query.userId || null;
        const targets = await resolveTargets(req.orgScope, teamId, userId);

        res.json({
            presentCount, absentCount, leaveCount,
            lateCount:       m.lateCount    || 0,
            avgAHT:          m.avgAHT       || 0,
            avgQuality:      m.avgQuality   || 0,
            totalTickets:    m.totalTickets || 0,
            behaviorIssues:  m.behaviorCount|| 0,
            statusBreakdown,
            targets,
            // Placeholder change %s — replace with prev-period comparison
            presentChg: 5, absentChg: -2, lateChg: 0, ahtChg: -3, qualityChg: 2, ticketChg: 8
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: ATTENDANCE TREND
   ───────────────────────────────────────────────────────── */
async function apiTrend(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $group: {
                _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, status: '$status' },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.date': 1 } }
        ]);

        const dateMap = {};
        agg.forEach(r => {
            const d = r._id.date;
            if (!dateMap[d]) dateMap[d] = { present: 0, absent: 0, leave: 0 };
            if (r._id.status === 'present') dateMap[d].present += r.count;
            if (r._id.status === 'absent')  dateMap[d].absent  += r.count;
            if (['leave','casual','sick'].includes(r._id.status)) dateMap[d].leave += r.count;
        });

        const labels  = Object.keys(dateMap).sort();
        res.json({
            labels,
            present: labels.map(d => dateMap[d].present),
            absent:  labels.map(d => dateMap[d].absent),
            leave:   labels.map(d => dateMap[d].leave)
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: PERFORMANCE TREND
   ───────────────────────────────────────────────────────── */
async function apiPerformanceTrend(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: { ...filter, status: 'present' } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                quality: { $avg: '$qualityScore' },
                aht:     { $avg: '$aht' },
                csat:    { $avg: { $multiply: ['$csat', 20] } } // 0-5 → 0-100
            }},
            { $sort: { _id: 1 } }
        ]);
        const labels = agg.map(r => r._id);
        res.json({
            labels,
            quality: agg.map(r => Math.round(r.quality || 0)),
            aht:     agg.map(r => Math.round(r.aht     || 0)),
            csat:    agg.map(r => Math.round(r.csat    || 0))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: TICKETS
   ───────────────────────────────────────────────────────── */
async function apiTickets(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                total: { $sum: '$ticketsProcessed' }
            }},
            { $sort: { _id: 1 } }
        ]);
        res.json({ labels: agg.map(r => r._id), data: agg.map(r => r.total) });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: BREAK PATTERNS
   ───────────────────────────────────────────────────────── */
async function apiBreaks(req, res) {
    try {
        const filter = buildFilter(req);
        const records = await PerformanceRecord.find(filter, 'breaks shiftStart shiftEnd').lean();
        const hourTotals = Array(24).fill(0);
        const hourCounts = Array(24).fill(0);
        const shiftCount = Array(24).fill(0);

        records.forEach(r => {
            // Track active scheduled shift hours (Shift Gauge)
            const activeHours = Array(24).fill(false);
            const starts = (r.shiftStart || '').split(',').map(s => s.trim());
            const ends = (r.shiftEnd || '').split(',').map(e => e.trim());
            for (let i = 0; i < starts.length; i++) {
                if (!starts[i] || !ends[i]) continue;
                const sHour = parseInt(starts[i].split(':')[0], 10);
                const eHour = parseInt(ends[i].split(':')[0], 10);
                if (isNaN(sHour) || isNaN(eHour)) continue;

                if (sHour <= eHour) {
                    for (let h = sHour; h < eHour; h++) {
                        activeHours[h] = true;
                    }
                } else {
                    for (let h = sHour; h < 24; h++) {
                        activeHours[h] = true;
                    }
                    for (let h = 0; h < eHour; h++) {
                        activeHours[h] = true;
                    }
                }
            }

            for (let h = 0; h < 24; h++) {
                if (activeHours[h]) {
                    shiftCount[h]++;
                }
            }

            // Track break patterns in 24-hour hour-of-day format
            (r.breaks || []).forEach(b => {
                let h = -1;
                if (b.startTime) {
                    h = parseInt(b.startTime.split(':')[0], 10);
                }
                if (h >= 0 && h < 24) {
                    hourTotals[h] += b.durationMins || 0;
                    hourCounts[h]++;
                }
            });
        });

        const hours   = Array.from({length:24}, (_,i) => i);
        const avgMins = hours.map((_,i) => shiftCount[i] ? Math.round((hourTotals[i]/shiftCount[i]) * 10) / 10 : 0);
        res.json({ hours, avgMins, shiftCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: WEEK OFF
   ───────────────────────────────────────────────────────── */
async function apiWeekOff(req, res) {
    try {
        const filter = { ...buildFilter(req), isWeekOff: true };
        const agg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $group: { _id: '$weekOffDay', count: { $sum: 1 } } }
        ]);
        const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const map = {};
        agg.forEach(r => { if (r._id) map[r._id] = r.count; });
        res.json({ days, counts: days.map(d => map[d] || 0) });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: PUNCTUALITY (top 10 worst)
   ───────────────────────────────────────────────────────── */
async function apiPunctuality(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: { ...filter, $or: [{ isLateLogin: true }, { isEarlyLogout: true }] } },
            { $group: {
                _id: '$userId',
                agentName: { $first: '$agentName' },
                avgLate:   { $avg: '$lateLoginMins' },
                avgEarly:  { $avg: '$earlyLogoutMins' }
            }},
            { $sort: { avgLate: -1 } },
            { $limit: 10 }
        ]);
        res.json({
            agents:    agg.map(a => a.agentName),
            lateData:  agg.map(a => Math.round(a.avgLate  || 0)),
            earlyData: agg.map(a => Math.round(a.avgEarly || 0))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: ERROR PATTERNS
   ───────────────────────────────────────────────────────── */
async function apiErrors(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $unwind: '$errors' },
            { $group: {
                _id: '$errors.category',
                count: { $sum: '$errors.count' },
                topSuggestion: { $first: '$errors.suggestion' }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        res.json({
            categories: agg.map(e => e._id || 'Unknown'),
            counts:      agg.map(e => e.count),
            suggestions: agg.map(e => e.topSuggestion)
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: LEADERBOARD
   ───────────────────────────────────────────────────────── */
async function apiLeaderboard(req, res) {
    try {
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $group: {
                _id:             '$userId',
                agentName:       { $first: '$agentName' },
                employeeId:      { $first: '$employeeId' },
                totalDays:       { $sum: 1 },
                presentDays:     { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                avgAHT:          { $avg: '$aht' },
                avgQuality:      { $avg: '$qualityScore' },
                avgPerformance:  { $avg: '$performanceScore' },
                avgLoginHrs:     { $avg: '$loginHrs' },
                totalTickets:    { $sum: '$ticketsProcessed' },
                behaviorIssues:  { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
            }},
            { $addFields: {
                attendancePct:   { $multiply: [{ $divide: ['$presentDays','$totalDays'] }, 100] }
            }},
            { $sort: { avgPerformance: -1 } },
            { $limit: 20 }
        ]);
        res.json(agg.map(a => ({ ...a, userId: a._id })));
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: SHIFT SWAPS
   ───────────────────────────────────────────────────────── */
async function apiShiftSwaps(req, res) {
    try {
        const filter = { ...buildFilter(req), 'shiftSwap.status': 'pending' };
        const records = await PerformanceRecord.find(filter)
            .sort({ date: -1 }).limit(20)
            .populate('shiftSwap.swappedWith', 'displayName username').lean();
        res.json(records.map(r => ({
            _id: r._id, agentName: r.agentName, date: r.date,
            originalShift: r.shiftSwap.originalShift,
            newShift: r.shiftSwap.newShift
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiShiftSwapAction(req, res, action) {
    try {
        const rec = await PerformanceRecord.findById(req.params.id);
        if (!rec) return res.status(404).json({ error: 'Not found' });
        rec.shiftSwap.status = action;
        rec.shiftSwap.approvedBy = req.user._id;
        await rec.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
}
const approveShiftSwap = (req, res) => apiShiftSwapAction(req, res, 'approved');
const rejectShiftSwap  = (req, res) => apiShiftSwapAction(req, res, 'rejected');

/* ─────────────────────────────────────────────────────────
   API: BEHAVIOR ISSUES
   ───────────────────────────────────────────────────────── */
async function apiBehaviorIssues(req, res) {
    try {
        const filter = { ...buildFilter(req), 'behaviorIssues.0': { $exists: true } };
        const records = await PerformanceRecord.find(filter)
            .sort({ date: -1 }).limit(20).lean();
        const issues = [];
        records.forEach(r => {
            r.behaviorIssues.forEach(b => {
                issues.push({ agentName: r.agentName, date: r.date, ...b });
            });
        });
        res.json(issues);
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: RECORDS (paginated)
   ───────────────────────────────────────────────────────── */
async function apiRecords(req, res) {
    try {
        const filter = buildFilter(req);
        const page  = Math.max(1, parseInt(req.query.page  || 1));
        const limit = Math.min(100, parseInt(req.query.limit || 30));
        const [data, total] = await Promise.all([
            PerformanceRecord.find(filter).sort({ date: -1 }).skip((page-1)*limit).limit(limit).lean(),
            PerformanceRecord.countDocuments(filter)
        ]);
        res.json({ data, total, page, pages: Math.ceil(total/limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   API: EMPLOYEE PROFILE
   ───────────────────────────────────────────────────────── */
async function apiEmployeeProfile(req, res) {
    try {
        const { userId } = req.params;
        const filter = { ...buildFilter(req), userId };
        const [user, agg] = await Promise.all([
            User.findById(userId).populate('teamId','name').lean(),
            PerformanceRecord.aggregate([
                { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId) } },
                { $group: {
                    _id: null,
                    totalDays:      { $sum: 1 },
                    presentDays:    { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                    leaveDays:      { $sum: { $cond: [{ $eq: ['$status','leave'] }, 1, 0] } },
                    lateDays:       { $sum: { $cond: ['$isLateLogin', 1, 0] } },
                    avgAHT:         { $avg: '$aht' },
                    avgQuality:     { $avg: '$qualityScore' },
                    behaviorIssues: { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
                }}
            ])
        ]);
        const m = agg[0] || {};
        const targets = await resolveTargets(req.orgScope, user?.teamId?._id, user?._id);

        res.json({
            agentName:      user?.displayName || user?.username,
            employeeId:     user?.employeeId,
            department:     user?.department,
            teamName:       user?.teamId?.name,
            shiftType:      user?.shiftType,
            attendancePct:  m.totalDays ? (m.presentDays/m.totalDays*100) : 0,
            leavesUsed:     m.leaveDays      || 0,
            lateDays:       m.lateDays       || 0,
            avgAHT:         m.avgAHT         || 0,
            avgQuality:     m.avgQuality     || 0,
            behaviorIssues: m.behaviorIssues || 0,
            image:          user?.image || '',
            profilePic:     user?.profilePic || '',
            targets
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiEmployeeRadar(req, res) {
    try {
        const { userId } = req.params;
        const filter = { ...buildFilter(req), userId };
        const empAgg = await PerformanceRecord.aggregate([
            { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId) } },
            { $group: {
                _id: null,
                totalDays:       { $sum: 1 },
                presentDays:     { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                avgQuality:      { $avg: '$qualityScore' },
                avgAHT:          { $avg: '$aht' },
                avgTickets:      { $avg: '$ticketsProcessed' },
                lateDays:        { $sum: { $cond: ['$isLateLogin', 1, 0] } },
                avgCsat:         { $avg: { $multiply: ['$csat', 20] } },
                avgFcr:          { $avg: '$fcr' },
                behaviorIssues:  { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
            }}
        ]);
        const teamAgg = await PerformanceRecord.aggregate([
            { $match: filter },
            { $group: {
                _id: null,
                totalDays:   { $sum: 1 },
                presentDays: { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                avgQuality:  { $avg: '$qualityScore' },
                avgAHT:      { $avg: '$aht' },
                avgTickets:  { $avg: '$ticketsProcessed' },
                avgCsat:     { $avg: { $multiply: ['$csat', 20] } },
                avgFcr:      { $avg: '$fcr' }
            }}
        ]);

        const e = empAgg[0] || {};
        const t = teamAgg[0] || {};
        const norm = (v, max) => Math.min(100, Math.round((v||0) / max * 100));

        const empData  = [
            e.totalDays ? Math.round(e.presentDays/e.totalDays*100) : 0,
            Math.round(e.avgQuality  || 0),
            norm(e.avgAHT, 30) > 0 ? 100 - norm(e.avgAHT, 30) : 0, // inverse: lower AHT = better
            norm(e.avgTickets, 50),
            e.totalDays ? Math.round((1 - (e.lateDays||0)/e.totalDays) * 100) : 0,
            Math.round(e.avgCsat     || 0),
            Math.round(e.avgFcr      || 0),
            Math.min(100, Math.round(100 - (e.behaviorIssues||0) * 5))
        ];
        const teamData = [
            t.totalDays ? Math.round(t.presentDays/t.totalDays*100) : 0,
            Math.round(t.avgQuality || 0),
            t.avgAHT ? 100 - norm(t.avgAHT, 30) : 0,
            norm(t.avgTickets, 50),
            75, // avg punctuality
            Math.round(t.avgCsat || 0),
            Math.round(t.avgFcr  || 0),
            85  // avg behavior
        ];

        res.json({
            labels: ['Attendance','Quality','AHT Eff.','Tickets','Punctuality','CSAT','FCR','Behavior'],
            empData, teamAvg: teamData
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiEmployeeTrend(req, res) {
    try {
        const { userId } = req.params;
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId), status: 'present' } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                quality: { $avg: '$qualityScore' },
                aht:     { $avg: '$aht' }
            }},
            { $sort: { _id: 1 } }
        ]);
        res.json({ labels: agg.map(r=>r._id), quality: agg.map(r=>Math.round(r.quality||0)), aht: agg.map(r=>Math.round(r.aht||0)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiEmployeeBreaks(req, res) {
    try {
        const { userId } = req.params;
        const filter = buildFilter(req);
        const records = await PerformanceRecord.find({ ...filter, userId: new mongoose.Types.ObjectId(userId) }, 'breaks shiftStart shiftEnd').lean();
        const hourTotals = Array(24).fill(0);
        const hourCounts = Array(24).fill(0);
        const shiftCount = Array(24).fill(0);

        records.forEach(r => {
            const activeHours = Array(24).fill(false);
            const starts = (r.shiftStart || '').split(',').map(s => s.trim());
            const ends = (r.shiftEnd || '').split(',').map(e => e.trim());
            for (let i = 0; i < starts.length; i++) {
                if (!starts[i] || !ends[i]) continue;
                const sHour = parseInt(starts[i].split(':')[0], 10);
                const eHour = parseInt(ends[i].split(':')[0], 10);
                if (isNaN(sHour) || isNaN(eHour)) continue;

                if (sHour <= eHour) {
                    for (let h = sHour; h < eHour; h++) {
                        activeHours[h] = true;
                    }
                } else {
                    for (let h = sHour; h < 24; h++) {
                        activeHours[h] = true;
                    }
                    for (let h = 0; h < eHour; h++) {
                        activeHours[h] = true;
                    }
                }
            }

            for (let h = 0; h < 24; h++) {
                if (activeHours[h]) {
                    shiftCount[h]++;
                }
            }

            (r.breaks || []).forEach(b => {
                let h = -1;
                if (b.startTime) {
                    h = parseInt(b.startTime.split(':')[0], 10);
                }
                if (h >= 0 && h < 24) {
                    hourTotals[h] += b.durationMins || 0;
                    hourCounts[h]++;
                }
            });
        });

        const hours   = Array.from({length:24}, (_,i) => i);
        const avgMins = hours.map((_,i) => shiftCount[i] ? Math.round((hourTotals[i]/shiftCount[i]) * 10) / 10 : 0);
        res.json({ hours, avgMins, shiftCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiEmployeeErrors(req, res) {
    try {
        const { userId } = req.params;
        const filter = buildFilter(req);
        const agg = await PerformanceRecord.aggregate([
            { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId) } },
            { $unwind: '$errors' },
            { $group: { _id: '$errors.category', count: {$sum:'$errors.count'}, description:{$first:'$errors.description'}, suggestion:{$first:'$errors.suggestion'} } },
            { $sort: { count: -1 } }
        ]);
        res.json(agg.map(e => ({ category: e._id, count: e.count, description: e.description, suggestion: e.suggestion })));
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function apiEmployeeBehavior(req, res) {
    try {
        const { userId } = req.params;
        const filter = buildFilter(req);
        const records = await PerformanceRecord.find({
            ...filter, userId: new mongoose.Types.ObjectId(userId), 'behaviorIssues.0': { $exists: true }
        }).sort({ date: -1 }).lean();
        const issues = [];
        records.forEach(r => r.behaviorIssues.forEach(b => issues.push({ ...b, date: r.date })));
        res.json(issues);
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   BULK UPLOAD
   ───────────────────────────────────────────────────────── */
async function bulkUpload(req, res) {
    const { dataType = 'full', sheetName = '', rows = [], org } = req.body;
    const batchId = nanoid(12);
    const batch = await UploadBatch.create({
        batchId, uploadedBy: req.user._id,
        organization: org || req.orgScope,
        fileName: sheetName, dataType,
        totalRows: rows.length, status: 'processing'
    });

    let successRows = 0, failedRows = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
            const userObj = await resolveUserId(row['Employee ID'] || row['employeeId'], row['Agent Name'] || row['agentName'], org || req.orgScope);
            if (!userObj) throw new Error('Employee not found');
            const userId = userObj._id;

            // Auto-map/backfill employee ID and name in the row
            row['Employee ID'] = userObj.employeeId || row['Employee ID'] || '';
            row['agentName'] = userObj.displayName || userObj.username;
            row['Agent Name'] = userObj.displayName || userObj.username;

            const date = new Date(row['Date'] || row['date']);
            if (isNaN(date)) throw new Error('Invalid date');

            const updateDoc = buildUpdateDoc(dataType, row, userId, org || req.orgScope, req.user._id, batchId);
            await PerformanceRecord.findOneAndUpdate(
                { userId, date, organization: org || req.orgScope },
                { $set: updateDoc },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            successRows++;
        } catch (err) {
            failedRows++;
            errors.push({ row: i + 2, message: err.message }); // +2 for 1-based + header
        }
    }

    await UploadBatch.findByIdAndUpdate(batch._id, {
        successRows, failedRows, errors,
        status: failedRows === rows.length ? 'failed' : failedRows > 0 ? 'partial' : 'completed'
    });

    res.json({ batchId, successRows, failedRows, errors: errors.slice(0, 20) });
}

async function resolveUserId(empId, agentName, org) {
    // 1. Try by employee ID or username
    if (empId) {
        const u = await User.findOne({
            $or: [
                { employeeId: String(empId).trim() },
                { username: String(empId).trim().toLowerCase() }
            ],
            organization: org
        }).lean();
        if (u) return u;
    }
    // 2. Try by Agent Name (displayName)
    if (agentName) {
        const cleanName = String(agentName).trim();
        const uName = await User.findOne({
            displayName: { $regex: new RegExp('^' + cleanName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') },
            organization: org
        }).lean();
        if (uName) return uName;

        // Try username without spaces
        const usernameGuess = cleanName.replace(/\s+/g, '').toLowerCase();
        const uUser = await User.findOne({
            username: usernameGuess,
            organization: org
        }).lean();
        if (uUser) return uUser;
    }
    return null;
}

function buildUpdateDoc(type, row, userId, org, uploadedBy, batchId) {
    const base = {
        userId, organization: org,
        agentName:  row['Agent Name']  || row['agentName']  || '',
        employeeId: row['Employee ID'] || row['employeeId'] || '',
        department: (row['Department'] || row['department'] || '').toLowerCase(),
        weekDay:    row['Day']         || row['weekDay']    || '',
        uploadedBy, uploadBatch: batchId, dataSource: 'csv'
    };

    if (['full','attendance'].includes(type)) Object.assign(base, {
        status:          row['Status']        || row['status']       || 'present',
        leaveType:       row['Leave Type']    || row['leaveType']    || 'none',
        shiftType:       row['Shift']         || row['shiftType']    || 'general',
        shiftStart:      row['Shift Start']   || '',
        shiftEnd:        row['Shift End']     || '',
        loginTime:       row['Login Time']    || row['loginTime']    || '',
        logoutTime:      row['Logout Time']   || row['logoutTime']   || '',
        loginHrs:        parseFloat(row['Login Hrs']       || 0),
        lateLoginMins:   parseInt(row['Late Login (min)']  || 0),
        earlyLogoutMins: parseInt(row['Early Logout (min)']|| 0),
        isLateLogin:     (parseInt(row['Late Login (min)'] || 0)) > 0,
        isEarlyLogout:   (parseInt(row['Early Logout (min)']||0)) > 0,
        isWeekOff:       (row['Status']||'').toLowerCase() === 'week_off',
        weekOffDay:      row['Week Off Day'] || ''
    });

    if (['full','aht'].includes(type)) Object.assign(base, {
        aht:              parseFloat(row['AHT']             || row['aht']              || 0),
        ticketsProcessed: parseInt(row['Tickets']           || row['ticketsProcessed'] || 0),
        fcr:              parseFloat(row['FCR %']           || row['fcr']              || 0),
        escalations:      parseInt(row['Escalations']       || 0),
        transferred:      parseInt(row['Transferred']       || 0)
    });

    if (['full','quality'].includes(type)) Object.assign(base, {
        qualityScore:    parseFloat(row['Quality Score']    || row['qualityScore']    || 0),
        performanceScore:parseFloat(row['Performance Score']|| row['performanceScore']|| 0),
        csat:            parseFloat(row['CSAT']             || row['csat']            || 0)
    });

    if (['full','shift_swap'].includes(type)) {
        base.shiftSwap = {
            requested: true,
            originalShift: row['Original Shift'] || row['originalShift'] || '',
            newShift:      row['New Shift']      || row['newShift']      || '',
            status:        row['Swap Status']    || row['swapStatus']    || 'pending'
        };
    }

    if (['full','late_login'].includes(type)) {
        base.loginTime     = row['Login Time']     || row['loginTime']     || '';
        base.lateLoginMins = parseInt(row['Late Login (min)'] || row['lateLoginMins'] || 0);
        base.isLateLogin   = base.lateLoginMins > 0;
    }

    if (['full','leave'].includes(type)) {
        base.status    = row['Status']     || row['status']    || 'leave';
        base.leaveType = row['Leave Type'] || row['leaveType'] || 'casual';
    }

    if (['full','breaks'].includes(type)) {
        base.totalBreakMins = parseInt(row['Total Break (min)'] || row['totalBreakMins'] || 0);
        if (row['Breaks'] || row['breaks']) {
            try {
                base.breaks = typeof (row['Breaks'] || row['breaks']) === 'string'
                    ? JSON.parse(row['Breaks'] || row['breaks'])
                    : (row['Breaks'] || row['breaks']);
            } catch(e) {
                const list = (row['Breaks'] || row['breaks'] || '').split(',');
                base.breaks = list.map(item => {
                    const [h, d] = item.split(':').map(Number);
                    return { hour: h || 0, durationMins: d || 0, type: 'short' };
                }).filter(b => b.durationMins > 0);
            }
        }
    }

    if (['full','behavior'].includes(type)) {
        if (row['Behavior Issue'] || row['behaviorIssue']) {
            base.behaviorIssues = [{
                type: row['Behavior Issue'] || row['behaviorIssue'] || '',
                severity: row['Behavior Severity'] || row['behaviorSeverity'] || 'low',
                note: row['Remarks'] || row['remarks'] || ''
            }];
        }
    }

    return base;
}

/* ─────────────────────────────────────────────────────────
   EXPORT
   ───────────────────────────────────────────────────────── */
async function exportXLSX(req, res) {
    try {
        const filter = buildFilter(req);
        const records = await PerformanceRecord.find(filter).sort({ date: -1 }).limit(5000).lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PulseTrack';

        // ── Attendance Sheet ──────────────────────────────
        const attSheet = workbook.addWorksheet('Attendance');
        attSheet.columns = [
            {header:'Date',w:14},{header:'Agent',w:20},{header:'Emp ID',w:12},
            {header:'Dept',w:14},{header:'Status',w:14},{header:'Shift',w:12},
            {header:'Login',w:10},{header:'Logout',w:10},{header:'Login Hrs',w:10},
            {header:'Late (min)',w:10},{header:'Early Out (min)',w:12},{header:'AHT',w:8},
            {header:'Quality',w:8},{header:'Tickets',w:8},{header:'CSAT',w:6},{header:'Performance',w:11}
        ].map(c => ({...c, width: c.w}));
        styleHeader(attSheet);
        records.forEach(r => {
            attSheet.addRow([
                r.date?.toISOString().split('T')[0], r.agentName, r.employeeId, r.department,
                r.status, r.shiftType, r.loginTime, r.logoutTime, r.loginHrs,
                r.lateLoginMins, r.earlyLogoutMins, r.aht, r.qualityScore,
                r.ticketsProcessed, r.csat, r.performanceScore
            ]);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=PulseTrack_Export.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) { res.status(500).json({ error: e.message }); }
}

function styleHeader(sheet) {
    sheet.getRow(1).eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1A1E2A'} };
        cell.font = { bold: true, color: { argb: 'FFF0F2F8' }, size: 11 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF3B7EFF' } } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    sheet.getRow(1).height = 22;
}

async function exportCSV(req, res) {
    const filter = buildFilter(req);
    const records = await PerformanceRecord.find(filter).sort({date:-1}).limit(10000).lean();
    const header = 'Date,Agent,Emp ID,Dept,Status,Shift,Login,Logout,Login Hrs,Late (min),Quality,AHT,Tickets,CSAT,Performance\n';
    const rows = records.map(r =>
        [r.date?.toISOString().split('T')[0], r.agentName, r.employeeId, r.department,
         r.status, r.shiftType, r.loginTime, r.logoutTime, r.loginHrs,
         r.lateLoginMins, r.qualityScore, r.aht, r.ticketsProcessed, r.csat, r.performanceScore]
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=PulseTrack_Export.csv');
    res.send(header + rows);
}

async function exportPDF(req, res) {
    res.status(501).json({ error: 'PDF export — integrate a PDF library like puppeteer or pdfkit' });
}

/* ─────────────────────────────────────────────────────────
   PUBLIC SHARE LINK
   ───────────────────────────────────────────────────────── */
const _shareTokens = new Map(); // In production: store in Redis or DB

async function generateShareLink(req, res) {
    try {
        const token = crypto.randomBytes(24).toString('hex');
        _shareTokens.set(token, {
            filters: req.query,
            org: req.orgScope,
            team: req.teamScope,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
        });
        const link = `${req.protocol}://${req.get('host')}/performance/api/performance/view/${token}`;
        res.json({ link });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

async function viewSharedReport(req, res) {
    const data = _shareTokens.get(req.params.token);
    if (!data || Date.now() > data.expiresAt) return res.status(410).send('Link expired or invalid.');
    res.json({ message: 'Shared report — render a read-only view here', filters: data.filters });
}

/* ─────────────────────────────────────────────────────────
   SAMPLE CSV
   ───────────────────────────────────────────────────────── */
function downloadSampleCSV(req, res) {
    const path = require('path');
    res.download(path.join(__dirname,'../sample-data/sample_full.csv'), 'PulseTrack_Sample.csv');
}

async function seedDemo(req, res) {
    try {
        const org = req.orgScope;
        const result = await seeder.seedDemoData(org, req.user?._id);
        res.json({ success: true, message: `Successfully seeded ${result.count} records for ${result.employeeCount} mock employees.` });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
}

async function clearDemo(req, res) {
    try {
        const org = req.orgScope;
        const result = await seeder.clearDemoData(org);
        res.json({ success: true, message: `Cleared ${result.deletedRecords} attendance records, ${result.deletedUsers} mock users, and ${result.deletedTeams} teams.` });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
}


/* ─────────────────────────────────────────────────────────
   NEW: EMPLOYEE PROFILE BY EMP ID
   ───────────────────────────────────────────────────────── */
async function apiEmployeeProfileByEmpId(req, res) {
    try {
        const { empId } = req.params;
        const org = req.orgScope;
        const user = await User.findOne({ 
            $or: [{ employeeId: String(empId) }, { username: String(empId).toLowerCase() }],
            organization: org 
        }).populate('teamId','name').lean();
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        
        const userId = user._id;
        const filter = { ...buildFilter(req), userId };
        const agg = await PerformanceRecord.aggregate([
            { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId) } },
            { $group: {
                _id: null,
                totalDays:      { $sum: 1 },
                presentDays:    { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                leaveDays:      { $sum: { $cond: [{ $eq: ['$status','leave'] }, 1, 0] } },
                lateDays:       { $sum: { $cond: ['$isLateLogin', 1, 0] } },
                avgAHT:         { $avg: '$aht' },
                avgQuality:     { $avg: '$qualityScore' },
                behaviorIssues: { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
            }}
        ]);
        const m = agg[0] || {};
        res.json({
            success: true,
            userId: user._id,
            agentName:      user.displayName || user.username,
            employeeId:     user.employeeId,
            department:     user.department,
            teamName:       user.teamId?.name,
            shiftType:      user.shiftType,
            attendancePct:  m.totalDays ? (m.presentDays/m.totalDays*100) : 0,
            leavesUsed:     m.leaveDays      || 0,
            lateDays:       m.lateDays       || 0,
            avgAHT:         m.avgAHT         || 0,
            avgQuality:     m.avgQuality     || 0,
            behaviorIssues: m.behaviorIssues || 0,
            image:          user.image || '',
            profilePic:     user.profilePic || '',
            targets:        await resolveTargets(org, user.teamId?._id, user._id)
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
}

/* ─────────────────────────────────────────────────────────
   NEW: ENCRYPTED PUBLIC SHARING API LINK
   ───────────────────────────────────────────────────────── */
async function generateEncryptedApiLink(req, res) {
    try {
        const { userId, duration = 60, oneTime = false, filters = {} } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        const userExists = await User.findById(userId);
        if (!userExists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + parseInt(duration, 10) * 60 * 1000);

        await SharedReport.create({
            token,
            userId,
            filters,
            oneTime: !!oneTime,
            expiresAt
        });

        const link = `${req.protocol}://${req.get('host')}/performance/api/performance/shared-report/${token}`;
        res.json({ success: true, link, token, expiresAt });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function viewEncryptedSharedReport(req, res) {
    try {
        const { token } = req.params;
        const shared = await SharedReport.findOne({ token }).populate('userId');
        
        if (!shared) {
            return res.status(404).json({ error: 'Report not found, invalid, or expired.' });
        }

        if (new Date() > shared.expiresAt) {
            await SharedReport.deleteOne({ _id: shared._id });
            return res.status(410).json({ error: 'Report has expired.' });
        }

        const userId = shared.userId._id;
        const org = shared.userId.organization || 'default';
        
        const filter = { userId, organization: org };
        if (shared.filters?.from || shared.filters?.to) {
            filter.date = {};
            if (shared.filters.from) filter.date.$gte = new Date(shared.filters.from);
            if (shared.filters.to) filter.date.$lte = new Date(shared.filters.to + 'T23:59:59');
        }

        const [user, agg, records] = await Promise.all([
            User.findById(userId).populate('teamId','name').lean(),
            PerformanceRecord.aggregate([
                { $match: { ...filter, userId: new mongoose.Types.ObjectId(userId) } },
                { $group: {
                    _id: null,
                    totalDays:      { $sum: 1 },
                    presentDays:    { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
                    leaveDays:      { $sum: { $cond: [{ $eq: ['$status','leave'] }, 1, 0] } },
                    lateDays:       { $sum: { $cond: ['$isLateLogin', 1, 0] } },
                    avgAHT:         { $avg: '$aht' },
                    avgQuality:     { $avg: '$qualityScore' },
                    behaviorIssues: { $sum: { $size: { $ifNull: ['$behaviorIssues',[]] } } }
                }}
            ]),
            PerformanceRecord.find(filter).sort({ date: -1 }).limit(100).lean()
        ]);

        const m = agg[0] || {};
        
        const reportData = {
            metadata: {
                sharedAt: shared.createdAt,
                expiresAt: shared.expiresAt,
                oneTimeView: shared.oneTime
            },
            employee: {
                agentName:      user?.displayName || user?.username,
                employeeId:     user?.employeeId,
                department:     user?.department,
                teamName:       user?.teamId?.name,
                shiftType:      user?.shiftType,
            },
            summary: {
                attendancePct:  m.totalDays ? (m.presentDays/m.totalDays*100) : 0,
                leavesUsed:     m.leaveDays      || 0,
                lateDays:       m.lateDays       || 0,
                avgAHT:         m.avgAHT         || 0,
                avgQuality:     m.avgQuality     || 0,
                behaviorIssues: m.behaviorIssues || 0,
            },
            recentRecords: records.map(r => ({
                date: r.date,
                status: r.status,
                shiftType: r.shiftType,
                loginTime: r.loginTime,
                logoutTime: r.logoutTime,
                loginHrs: r.loginHrs,
                lateLoginMins: r.lateLoginMins,
                aht: r.aht,
                qualityScore: r.qualityScore,
                ticketsProcessed: r.ticketsProcessed,
                performanceScore: r.performanceScore
            }))
        };

        if (shared.oneTime) {
            await SharedReport.deleteOne({ _id: shared._id });
        }

        res.json(reportData);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function apiGetSettings(req, res) {
    try {
        const org = req.orgScope;
        
        // 1. Get Org Defaults
        let orgDefaults = await KpiTarget.findOne({ organization: org, teamId: null, userId: null }).lean();
        if (!orgDefaults) {
            orgDefaults = { attendanceTarget: 80, qualityTarget: 95, ahtTarget: 6.0, ticketsTarget: 300 };
        }

        // 2. Get all active teams and their targets
        const teams = await Team.find({ organization: org, isActive: true }).select('name _id').lean();
        const teamTargets = await KpiTarget.find({ organization: org, teamId: { $ne: null }, userId: null }).lean();
        const teamMap = {};
        teamTargets.forEach(t => { teamMap[t.teamId.toString()] = t; });
        const teamsData = teams.map(t => ({
            _id: t._id,
            name: t.name,
            targets: teamMap[t._id.toString()] || null
        }));

        // 3. Get all active agents and their targets
        const agentsQuery = { organization: org, isActive: true };
        if (req.teamScope) {
            agentsQuery.teamId = req.teamScope;
        }
        const agents = await User.find(agentsQuery).select('displayName username employeeId teamId _id').lean();
        const agentTargets = await KpiTarget.find({ organization: org, userId: { $ne: null } }).lean();
        const agentMap = {};
        agentTargets.forEach(a => { agentMap[a.userId.toString()] = a; });
        const agentsData = agents.map(a => ({
            _id: a._id,
            displayName: a.displayName || a.username,
            employeeId: a.employeeId,
            teamId: a.teamId,
            targets: agentMap[a._id.toString()] || null
        }));

        res.json({
            orgDefaults,
            teams: teamsData,
            agents: agentsData
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function apiSaveSettings(req, res) {
    try {
        const org = req.orgScope;
        const { scope, teamId, userId, attendanceTarget, qualityTarget, ahtTarget, ticketsTarget } = req.body;

        // Role-based scope checks
        if (req.user.role === 'team_lead') {
            if (scope === 'org') {
                return res.status(403).json({ error: 'Team Leads cannot configure organization-wide settings.' });
            }
            if (scope === 'team') {
                if (String(teamId) !== String(req.teamScope)) {
                    return res.status(403).json({ error: 'Team Leads can only configure targets for their own team.' });
                }
            }
            if (scope === 'agent') {
                const targetUser = await User.findOne({ _id: userId, organization: org, teamId: req.teamScope });
                if (!targetUser) {
                    return res.status(403).json({ error: 'Team Leads can only configure targets for their own team members.' });
                }
            }
        }

        const isDelete = (attendanceTarget === null || attendanceTarget === undefined || attendanceTarget === '') &&
                         (qualityTarget === null || qualityTarget === undefined || qualityTarget === '') &&
                         (ahtTarget === null || ahtTarget === undefined || ahtTarget === '') &&
                         (ticketsTarget === null || ticketsTarget === undefined || ticketsTarget === '');

        if (isDelete) {
            const query = { organization: org };
            if (scope === 'org') {
                query.teamId = null;
                query.userId = null;
            } else if (scope === 'team') {
                query.teamId = teamId;
                query.userId = null;
            } else if (scope === 'agent') {
                query.teamId = teamId;
                query.userId = userId;
            }
            await KpiTarget.deleteOne(query);
            return res.json({ success: true, message: 'Settings reverted to defaults.' });
        }

        // Upsert target
        const query = { organization: org };
        if (scope === 'org') {
            query.teamId = null;
            query.userId = null;
        } else if (scope === 'team') {
            query.teamId = teamId;
            query.userId = null;
        } else if (scope === 'agent') {
            query.teamId = teamId;
            query.userId = userId;
        }

        const updateData = {};
        if (attendanceTarget !== undefined && attendanceTarget !== '') updateData.attendanceTarget = Number(attendanceTarget);
        if (qualityTarget !== undefined && qualityTarget !== '') updateData.qualityTarget = Number(qualityTarget);
        if (ahtTarget !== undefined && ahtTarget !== '') updateData.ahtTarget = Number(ahtTarget);
        if (ticketsTarget !== undefined && ticketsTarget !== '') updateData.ticketsTarget = Number(ticketsTarget);

        const saved = await KpiTarget.findOneAndUpdate(
            query,
            { $set: updateData },
            { new: true, upsert: true }
        );

        res.json({ success: true, data: saved });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

/* ─────────────────────────────────────────────────────────
   BREAK RECORDER
   ───────────────────────────────────────────────────────── */
async function viewBreaksRecorder(req, res) {
    try {
        if (!['admin', 'vendor', 'team_lead'].includes(req.user.role)) {
            return res.status(403).send('Forbidden');
        }
        const { teams, departments } = await getTeamsAndDepts(req.orgScope);
        res.render('performanceLayout', {
            body: `<div class="tracking-page-container" data-page="breaks-recorder" data-title="Break Recorder"></div>`,
            title: 'Break Recorder — PulseTrack',
            user: req.user,
            currentPage: 'breaks-recorder',
            org: req.orgScope,
            teams, departments,
            filters: req.query,
            behaviorCount: 0
        });
    } catch (e) { res.status(500).send(e.message); }
}

async function apiGetBreakRecorderUsers(req, res) {
    try {
        const role = req.user.role;
        const org = req.orgScope;
        let dept = req.query.dept || req.query.department;

        // Force Team Leads to their own department
        if (role === 'team_lead') {
            dept = req.user.department;
        }

        if (!dept) {
            return res.status(400).json({ error: 'Department is required' });
        }

        // Find all active agents in this department
        const users = await User.find({
            organization: org,
            department: dept.toLowerCase().trim(),
            role: 'user',
            isActive: true
        }).select('username displayName employeeId').lean();

        // Calculate today's date range
        const todayStr = new Date().toISOString().split('T')[0];
        const startOfToday = new Date(todayStr + 'T00:00:00');
        const endOfToday = new Date(todayStr + 'T23:59:59.999');

        const result = [];
        for (const u of users) {
            const record = await PerformanceRecord.findOne({
                userId: u._id,
                date: { $gte: startOfToday, $lte: endOfToday }
            }).lean();

            const activeBreak = record?.breaks?.find(b => !b.endTime);
            result.push({
                _id: u._id,
                username: u.username,
                displayName: u.displayName || u.username,
                employeeId: u.employeeId || '—',
                isOnBreak: !!activeBreak,
                breakStartTime: activeBreak ? activeBreak.startTime : null
            });
        }

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function apiToggleAgentBreaks(req, res) {
    try {
        const { userIds, type } = req.body;
        if (!userIds || !Array.isArray(userIds) || !userIds.length) {
            return res.status(400).json({ error: 'Agent IDs list is required' });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startOfToday = new Date(todayStr + 'T00:00:00');
        const endOfToday = new Date(todayStr + 'T23:59:59.999');

        const now = new Date();
        const timeStr = now.toTimeString().substring(0, 5); // "HH:MM"

        for (const uid of userIds) {
            let record = await PerformanceRecord.findOne({
                userId: uid,
                date: { $gte: startOfToday, $lte: endOfToday }
            });

            if (!record) {
                // Initialize today's record
                const user = await User.findById(uid);
                if (!user) continue;
                record = new PerformanceRecord({
                    userId: user._id,
                    employeeId: user.employeeId || 'EMP-' + user.username,
                    agentName: user.displayName || user.username,
                    organization: user.organization,
                    department: user.department,
                    teamId: user.teamId,
                    date: startOfToday,
                    status: 'present',
                    shiftType: user.shiftType || 'general',
                    breaks: []
                });
            }

            const activeBreak = record.breaks.find(b => !b.endTime);
            if (activeBreak) {
                // Stop break
                activeBreak.endTime = timeStr;
                const [sh, sm] = activeBreak.startTime.split(':').map(Number);
                const [eh, em] = timeStr.split(':').map(Number);
                let diff = (eh * 60 + em) - (sh * 60 + sm);
                if (diff < 0) diff += 24 * 60; // crossover midnight
                activeBreak.durationMins = diff;

                // Re-sum total break minutes
                record.totalBreakMins = record.breaks.reduce((acc, b) => acc + (b.durationMins || 0), 0);
            } else {
                // Start break
                record.breaks.push({
                    startTime: timeStr,
                    endTime: '',
                    durationMins: 0,
                    type: type || 'short',
                    hour: now.getHours()
                });
            }

            await record.save();
        }

        res.json({ success: true, message: 'Agent breaks updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

module.exports = {
    viewDashboard, viewOverview, viewRecords, viewPerformance, viewShifts, viewLeaves,
    viewBreaks, viewBehavior, viewErrors, viewEmployee, viewTrends, viewUpload, viewExport,
    viewTeams, viewSettings, downloadSampleCSV,
    apiSummary, apiTrend, apiPerformanceTrend, apiTickets, apiBreaks, apiWeekOff,
    apiPunctuality, apiErrors, apiLeaderboard, apiShiftSwaps, apiBehaviorIssues, apiRecords,
    apiEmployeeProfile, apiEmployeeRadar, apiEmployeeTrend, apiEmployeeBreaks,
    apiEmployeeErrors, apiEmployeeBehavior,
    approveShiftSwap, rejectShiftSwap,
    bulkUpload, exportXLSX, exportCSV, exportPDF,
    generateShareLink, viewSharedReport,
    seedDemo, clearDemo,
    apiEmployeeProfileByEmpId, generateEncryptedApiLink, viewEncryptedSharedReport,
    apiGetSettings, apiSaveSettings,
    viewBreaksRecorder, apiGetBreakRecorderUsers, apiToggleAgentBreaks
};
