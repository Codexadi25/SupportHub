const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },
    contentType: {
        type: String,
        enum: ['plain', 'html', 'markdown'],
        default: 'plain'
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
    targetUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    targetRoles: [{
        type: String,
        enum: ['user', 'editor', 'admin', 'all']
    }],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    type: {
        type: String,
        enum: ['announcement', 'maintenance', 'update', 'warning', 'info'],
        default: 'info'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedBy: {
        type: String,
        default: null
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        default: function() {
            // Default to 1 year in the future for chat messages
            return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
    },
    isRead: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        url: String
    }],
    lob: { type: String, default: 'zomato', lowercase: true, trim: true }
}, {
    timestamps: true
});

// Index for efficient queries
messageSchema.index({ isActive: 1, endDate: 1, createdAt: -1 });
messageSchema.index({ targetUsers: 1, isActive: 1 });
messageSchema.index({ targetRoles: 1, isActive: 1 });

// Virtual for checking if message is expired
messageSchema.virtual('isExpired').get(function() {
    return new Date() > this.endDate;
});

// Method to check if user should see this message
messageSchema.methods.shouldShowToUser = function(user) {
    if (!this.isActive || this.isExpired) return false;
    if (!user) return false;

    const userIdStr = String(user._id || '');

    // Check if user is specifically targeted
    if (Array.isArray(this.targetUsers) && this.targetUsers.length > 0) {
        const targeted = this.targetUsers.some(id => String(id) === userIdStr);
        if (targeted) return true;
    }

    // Check if user's role is targeted
    if (Array.isArray(this.targetRoles) && (this.targetRoles.includes('all') || this.targetRoles.includes(user.role))) {
        return true;
    }

    return false;
};

module.exports = mongoose.model('Message', messageSchema);

