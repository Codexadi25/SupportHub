const mongoose = require('mongoose');

// Schema for individual SOP entries
const sopEntrySchema = new mongoose.Schema({
  lob: { type: String, required: true, default: 'Zomato' }, // Customisable LOB
  category: { type: String, required: true }, // e.g., "01. PRE-PICKUP"
  phase: String, // Phase info e.g. "(Phase: Restaurant / Assigning)"
  title: String,
  condition: String,
  action: String, // custom action text (enum removed)
  details: String, // Detailed instructions / bullet points
  tags: [String],
  status: { type: String, enum: ['Published', 'Draft', 'Archived'], default: 'Published' },
  order: { type: Number, default: 0 }, // Sort order index
  lastUpdated: {
    at: { type: Date, default: Date.now },
    by: String, // Username
    role: String // Role
  }
});

// Schema for tracking changes (Audit Log)
const auditLogSchema = new mongoose.Schema({
  sopId: mongoose.Schema.Types.ObjectId,
  action: String, // e.g., "Created", "Updated", "Published"
  details: String,
  timestamp: { type: Date, default: Date.now },
  user: String
});

// Schema for Admin-managed colors
const themeSchema = new mongoose.Schema({
  lob: { type: String, unique: true },
  primaryColor: { type: String, default: '#CB202D' }, // Zomato Red
  secondaryColor: { type: String, default: '#2D2D2D' }
});

module.exports = {
  Sop: mongoose.model('Sop', sopEntrySchema),
  Audit: mongoose.model('Audit', auditLogSchema),
  Theme: mongoose.model('Theme', themeSchema)
};