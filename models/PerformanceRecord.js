const mongoose = require('mongoose');

// ─── Break Entry ────────────────────────────────────────────────────────────
const breakEntrySchema = new mongoose.Schema({
    startTime: { type: String, default: '' },   // "HH:MM" 24h
    endTime:   { type: String, default: '' },
    durationMins: { type: Number, default: 0 },
    hour: { type: Number, default: 0 },          // which hour of shift (0-indexed)
    type: { type: String, enum: ['short', 'lunch', 'bio', 'other'], default: 'short' }
}, { _id: false });

// ─── Main Attendance Record ──────────────────────────────────────────────────
// ─── Main Performance Record ──────────────────────────────────────────────────
const performanceRecordSchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId:   { type: String, required: true },
    agentName:    { type: String, required: true },
    organization: { type: String, lowercase: true, default: 'default' },
    department:   { type: String, lowercase: true, default: 'none' },
    teamId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

    // ── Date / Shift ──────────────────────────────────────────────────────────
    date:         { type: Date, required: true },
    weekDay:      { type: String, enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
    shiftType:    { type: String, default: 'general' }, // morning / afternoon / night / general
    shiftStart:   { type: String, default: '' },        // "HH:MM"
    shiftEnd:     { type: String, default: '' },
    isWeekOff:    { type: Boolean, default: false },
    weekOffDay:   { type: String, default: '' },        // which day is WO e.g. "Sun"

    // ── Attendance ────────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['present','absent','half_day','leave','work_from_home','week_off','holiday','training'],
        default: 'present'
    },
    leaveType: {
        type: String,
        enum: ['casual','sick','earned','unpaid','comp_off','maternity','paternity','none'],
        default: 'none'
    },
    loginTime:    { type: String, default: '' },
    logoutTime:   { type: String, default: '' },
    loginHrs:     { type: Number, default: 0 },        // decimal hours logged in
    lateLoginMins:   { type: Number, default: 0 },     // mins late from shift start
    earlyLogoutMins: { type: Number, default: 0 },     // mins early from shift end
    isLateLogin:     { type: Boolean, default: false },
    isEarlyLogout:   { type: Boolean, default: false },

    // ── Shift Swap ────────────────────────────────────────────────────────────
    shiftSwap: {
        requested: { type: Boolean, default: false },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        swappedWith: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        originalShift: { type: String, default: '' },
        newShift:      { type: String, default: '' },
        status: { type: String, enum: ['pending','approved','rejected','none'], default: 'none' }
    },

    // ── Performance ───────────────────────────────────────────────────────────
    ticketsProcessed:  { type: Number, default: 0 },
    aht:               { type: Number, default: 0 },   // Average Handling Time (minutes)
    qualityScore:      { type: Number, default: 0 },   // 0–100
    performanceScore:  { type: Number, default: 0 },   // composite 0–100
    csat:              { type: Number, default: 0 },   // Customer Satisfaction 0–5
    fcr:               { type: Number, default: 0 },   // First Contact Resolution %
    escalations:       { type: Number, default: 0 },
    reOpened:          { type: Number, default: 0 },   // tickets re-opened
    transferred:       { type: Number, default: 0 },

    // ── Breaks ────────────────────────────────────────────────────────────────
    breaks:            { type: [breakEntrySchema], default: [] },
    totalBreakMins:    { type: Number, default: 0 },
    breakViolations:   { type: Number, default: 0 },   // breaks exceeding policy

    // ── Behavior / Compliance ─────────────────────────────────────────────────
    behaviorIssues: [{
        type: { type: String, default: '' },           // e.g. "Rude to customer"
        severity: { type: String, enum: ['low','medium','high','critical'], default: 'low' },
        note: { type: String, default: '' }
    }],

    // ── Error Patterns ────────────────────────────────────────────────────────
    errors: [{
        category:    { type: String, default: '' },    // e.g. "Data Entry"
        description: { type: String, default: '' },
        count:       { type: Number, default: 1 },
        suggestion:  { type: String, default: '' }     // AI/manual improvement note
    }],

    // ── Audit ─────────────────────────────────────────────────────────────────
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadBatch: { type: String, default: '' },   // batch ID from CSV upload
    dataSource:  { type: String, enum: ['manual','csv','api','auto'], default: 'manual' },
    remarks:     { type: String, default: '' },

}, { timestamps: true });

// Compound unique index: one record per employee per date per organization
performanceRecordSchema.index({ userId: 1, date: 1, organization: 1 }, { unique: true });
performanceRecordSchema.index({ organization: 1, department: 1, date: 1 });
performanceRecordSchema.index({ teamId: 1, date: 1 });
performanceRecordSchema.index({ employeeId: 1, date: 1 });

module.exports = mongoose.model('PerformanceRecord', performanceRecordSchema);
