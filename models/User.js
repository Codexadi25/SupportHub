const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['new','user', 'editor', 'admin', 'team_lead', 'quality_analyst', 'vendor'], default: 'new' },
    department: { type: String, trim: true, lowercase: true, default: 'none' },
    email: { type: String, default: '' },
    profilePic: { type: String, default: '' },
    fontSize: { type: String, default: 'medium' },
    uiColor: { type: String, default: '#2563eb' },
    nightMode: { type: Boolean, default: false },
    currentSessionId: { type: String, default: '' },
    lastActiveIp: { type: String, default: '' },
    profileName: { type: String, default: '' },
    usernameLastChanged: { type: Date, default: null },
    bgColor: { type: String, default: '' }
}, { timestamps: true });

// Hash password before saving a new user
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to compare entered password with hashed password
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);