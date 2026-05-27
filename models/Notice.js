const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        maxlength: 100
    },
    content: {
        type: String,
        required: true,
        maxlength: 300
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorName: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['info', 'announcement', 'maintenance', 'update', 'warning'],
        default: 'info'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    lob: { type: String, default: 'zomato', lowercase: true, trim: true }
}, { timestamps: true });

noticeSchema.index({ isActive: 1, endDate: 1, createdAt: -1 });

noticeSchema.virtual('isExpired').get(function() {
    return !!(this.endDate && new Date() > this.endDate);
});

module.exports = mongoose.model('Notice', noticeSchema);


