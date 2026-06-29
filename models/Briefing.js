const mongoose = require('mongoose');

const briefingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    content: {
        type: String,
        required: true,
        maxlength: 50000
    },
    contentType: {
        type: String,
        enum: ['plain', 'html', 'markdown'],
        default: 'plain'
    },
    type: {
        type: String,
        enum: ['daily_briefing', 'sop_update'],
        required: true,
        default: 'daily_briefing'
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
    authorRole: {
        type: String,
        required: true
    },
    lob: {
        type: String,
        default: 'zomato',
        lowercase: true,
        trim: true
    },
    attachments: [{
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        url: String
    }]
}, {
    timestamps: true
});

briefingSchema.index({ lob: 1, createdAt: -1 });

module.exports = mongoose.model('Briefing', briefingSchema);
