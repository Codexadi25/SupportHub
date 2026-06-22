const mongoose = require('mongoose');

const uploadBatchSchema = new mongoose.Schema({
    batchId:      { type: String, required: true, unique: true },
    uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: String, lowercase: true, default: 'startek india' },
    fileName:     { type: String, default: '' },
    dataType: {
        type: String,
        enum: ['full','attendance','aht','quality','shift_swap','late_login','leave','breaks','behavior','errors','performance'],
        default: 'full'
    },
    totalRows:    { type: Number, default: 0 },
    successRows:  { type: Number, default: 0 },
    failedRows:   { type: Number, default: 0 },
    errors:       [{ row: Number, message: String }],
    status:       { type: String, enum: ['processing','completed','partial','failed'], default: 'processing' },
    dateRange: {
        from: { type: Date },
        to:   { type: Date }
    }
}, { timestamps: true });

module.exports = mongoose.model('UploadBatch', uploadBatchSchema);
