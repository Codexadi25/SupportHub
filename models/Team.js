const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name:         { type: String, required: true, trim: true },
    organization: { type: String, lowercase: true, default: 'default' },
    department:   { type: String, lowercase: true, default: 'none' },
    teamLeadId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    members:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isActive:     { type: Boolean, default: true },
    shiftPolicy: {
        defaultShift: { type: String, default: 'general' },
        lateLoginThresholdMins: { type: Number, default: 10 },
        earlyLogoutThresholdMins: { type: Number, default: 10 },
        maxBreakMinsPerShift: { type: Number, default: 60 },
        workingHoursPerDay: { type: Number, default: 9 }
    }
}, { timestamps: true });

teamSchema.index({ organization: 1, department: 1 });

module.exports = mongoose.model('Team', teamSchema);
