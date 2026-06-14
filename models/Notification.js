const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
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
    type: { 
        type: String, 
        enum: ['username_change', 'password_change', 'role_change', 'app_update', 'sop_update', 'briefing', 'admin_broadcast', 'custom'],
        default: 'custom' 
    },
    recipientId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }, // Null means broadcast to all users (or targeted by role/department)
    recipientRole: { 
        type: String, 
        default: null 
    }, // Target specific roles
    recipientDepartment: { 
        type: String, 
        default: null 
    }, // Target specific departments (department slug)
    readBy: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        readAt: { 
            type: Date, 
            default: Date.now 
        }
    }],
    lob: { 
        type: String, 
        default: 'zomato', 
        lowercase: true, 
        trim: true 
    }
}, {
    timestamps: true
});

// Indexing for performance
notificationSchema.index({ recipientId: 1, lob: 1, createdAt: -1 });
notificationSchema.index({ lob: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
