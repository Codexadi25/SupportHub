const mongoose = require('mongoose');

const permittedWordSchema = new mongoose.Schema({
    word: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true 
    },
    similarWords: { 
        type: [String], 
        default: [] 
    },
    source: { 
        type: String, 
        default: 'user_added', 
        enum: ['user_added', 'cands_db'] 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });

permittedWordSchema.index({ word: 1 });

module.exports = mongoose.model('PermittedWord', permittedWordSchema);
