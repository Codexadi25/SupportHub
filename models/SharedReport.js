const mongoose = require('mongoose');

const sharedReportSchema = new mongoose.Schema({
    token:       { type: String, required: true, unique: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filters:     { type: Object, default: {} },
    oneTime:     { type: Boolean, default: false },
    expiresAt:   { type: Date, required: true, index: { expires: 0 } } // TTL Index
}, { timestamps: true });

module.exports = mongoose.model('SharedReport', sharedReportSchema);
