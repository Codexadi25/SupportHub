const mongoose = require('mongoose');

const kpiTargetSchema = new mongoose.Schema({
    organization: { type: String, lowercase: true, required: true },
    // Scopes: 
    // - org-level target: teamId = null, userId = null
    // - team-level target: teamId = ObjectId, userId = null
    // - user-level target: teamId = ObjectId, userId = ObjectId
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Target values
    attendanceTarget: { type: Number, default: 80 },  // e.g. 80% (corresponds to max 20% shrinkage)
    qualityTarget:    { type: Number, default: 95 },  // e.g. 95%
    ahtTarget:        { type: Number, default: 4.5 }, // e.g. 4.5 minutes
    ticketsTarget:    { type: Number, default: 120 }  // e.g. 120 tickets
}, { timestamps: true });

// Compound unique index ensures one configuration per specific scope
kpiTargetSchema.index({ organization: 1, teamId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('KpiTarget', kpiTargetSchema);
