const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['user', 'bot'], required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const sopChatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lob: { type: String, required: true, default: 'zomato' },
  messages: [chatMessageSchema]
}, { timestamps: true });

// Prevent duplicate compilation
module.exports = mongoose.models.SopChat || mongoose.model('SopChat', sopChatSchema);
