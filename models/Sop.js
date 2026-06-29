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
  },
  embedding: { type: [Number] } // Vector embedding for AI context search
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

// Schema for SOP layout structures and sidebar widget configuration
const sopTemplateSchema = new mongoose.Schema({
  lob: { type: String, required: true, unique: true },
  department: { type: String, required: true, lowercase: true, trim: true, default: 'zomato' },
  title: { type: String, default: '' },
  headerImage: { type: String, default: '' },
  googleSheetUrl: { type: String, default: '' },
  sidebarConfig: {
    calculator: { type: Boolean, default: true },
    callingScript: { type: String, default: '"Hi, Good Morning Sir, My name is XYZ from Zomato. May I know the reason for the delay and by when the order will be delivered?"' },
    quickPrompts: [{
      label: String,
      text: String
    }],
    recentUpdates: [{
      date: String,
      text: String
    }]
  },
  categories: [{
    name: { type: String, required: true },
    phase: String,
    order: { type: Number, default: 0 }
  }]
}, { timestamps: true });

// Schema for tracking user-specific drafts
const sopDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lob: { type: String, required: true },
  template: {
    headerImage: String,
    googleSheetUrl: String,
    sidebarConfig: Object,
    categories: Array
  },
  cards: [Object], // Snapshot array of SOP card objects
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Schema for tracking published history versions (commit snapshot)
const sopHistorySchema = new mongoose.Schema({
  lob: { type: String, required: true },
  version: { type: Number, required: true },
  publishedAt: { type: Date, default: Date.now },
  publishedBy: String,
  publishedByRole: String,
  templateSnapshot: Object,
  cardsSnapshot: [Object],
  changesSummary: [Object]
}, { timestamps: true });

// Avoid duplicate model compilation errors by checking mongoose.models first
module.exports = {
  Sop: mongoose.models.Sop || mongoose.model('Sop', sopEntrySchema),
  Audit: mongoose.models.Audit || mongoose.model('Audit', auditLogSchema),
  Theme: mongoose.models.Theme || mongoose.model('Theme', themeSchema),
  SopTemplate: mongoose.models.SopTemplate || mongoose.model('SopTemplate', sopTemplateSchema),
  SopDraft: mongoose.models.SopDraft || mongoose.model('SopDraft', sopDraftSchema),
  SopHistory: mongoose.models.SopHistory || mongoose.model('SopHistory', sopHistorySchema)
};