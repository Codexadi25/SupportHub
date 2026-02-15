const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Sop, Audit, Theme } = require('../models/Sop');
const sopController = require('../controllers/sopController');
const { generateSopDraft } = require('../services/aiService');

// Multer setup for processing PDF, DOCX, Images, etc.
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to check role authorization (supports session or req.user)
const checkRole = (roles) => (req, res, next) => {
  const role = req.session?.user?.role || req.user?.role;
  if (!role) return res.status(401).json({ error: 'Authentication required' });
  if (!roles.includes(role)) return res.status(403).json({ error: 'Unauthorized access' });
  next();
};

// Normalize LOB param so downstream handlers always have a value
router.use((req, res, next) => {
  try {
    // ensure req.params exists (defensive)
    if (!req.params) req.params = {};
    if (!req.params.lob) {
      req.params.lob = req.body?.lob || req.query?.lob || req.user?.lob || 'zomato';
    } else {
      // coerce to string to avoid weird param processing errors
      req.params.lob = String(req.params.lob);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// 1. GET Published SOP (For Agents)
// GET Published SOP (For Agents) with optional search & pagination
router.get('/view', async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.session?.user?.lob || 'zomato';
    const theme = await Theme.findOne({ lob }) || {};

    // search & pagination
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(6, Math.min(50, parseInt(req.query.perPage, 10) || 12));

    const filter = { lob, status: 'Published' };
    if (q) {
      const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: r },
        { condition: r },
        { tags: r }
      ];
    }

    const total = await Sop.countDocuments(filter);
    const sops = await Sop.find(filter).sort({ 'lastUpdated.at': -1 }).skip((page - 1) * perPage).limit(perPage);

    // Group by category for the panel UI
    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));
    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render('sop_panel', { categories, allTags, theme, user: req.session?.user || req.user, mode: 'view', lob, pagination: { page, perPage, total } });
  } catch (error) {
    console.error("Error fetching SOPs:", error);
    res.status(500).json({ error: "Failed to fetch SOPs" });
  }
});

// 2. POST AI Auto-Draft
router.post('/ai-draft', checkRole(['QA', 'Admin', 'TL']), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Determine LOB: prefer mounted param, fall back to body
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    if (!lob) {
      return res.status(400).json({ error: "LOB (Line of Business) is required" });
    }

    // Process the file and generate SOP draft
    const draftData = await generateSopDraft(req.file.buffer, req.file.mimetype);

    // Save as Draft with tracking
    const newSop = await Sop.create({
      ...draftData,
      lob,
      status: 'Draft',
      lastUpdated: {
        at: new Date(),
        by: req.user?.username || 'system',
        role: req.user?.role || 'system'
      }
    });

    res.json({ success: true, message: "Draft created via AI", data: newSop });
  } catch (error) {
    console.error("AI Processing Error:", error);
    res.status(500).json({ error: "Failed to process SOP draft" });
  }
});

// 4. Create new SOP block (from modal)
router.post('/create-block', checkRole(['Admin']), async (req, res, next) => {
  try {
    // controller expects lob in body (modal includes hidden lob)
    await sopController.createBlock(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 5. GET Drafts for a LOB (Admin/QA view)
router.get('/drafts', checkRole(['Admin','QA','TL','Editor']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.query?.lob || req?.body?.lob || req?.session?.user?.lob;
    const theme = await Theme.findOne({ lob }) || {};

    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(6, Math.min(50, parseInt(req.query.perPage, 10) || 12));

    const filter = { lob, status: 'Draft' };
    if (q) {
      const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { title: r }, { condition: r }, { tags: r } ];
    }

    const total = await Sop.countDocuments(filter);
    const sops = await Sop.find(filter).sort({ 'lastUpdated.at': -1 }).skip((page - 1) * perPage).limit(perPage);

    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));
    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render('sop_panel', { categories, allTags, theme, user: req.session?.user || req.user, mode: 'draft', lob, pagination: { page, perPage, total } });
  } catch (err) {
    console.error('Error loading drafts:', err);
    res.status(500).send('Failed to load drafts');
  }
});

// 6. Approval endpoint
router.post('/approve/:id', checkRole(['Admin']), async (req, res, next) => {
  try {
    await sopController.approveDraft(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 3. ADMIN: Manage Colors
router.post('/theme', checkRole(['Admin']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    const { primary, secondary } = req.body;

    if (!primary || !secondary) {
      return res.status(400).json({ error: "Primary and secondary colors are required" });
    }

    await Theme.findOneAndUpdate(
      { lob },
      { primaryColor: primary, secondaryColor: secondary },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Theme updated successfully" });
  } catch (error) {
    console.error("Theme update error:", error);
    res.status(500).json({ error: "Failed to update theme" });
  }
});

// Admin settings UI
router.get('/admin-settings', checkRole(['Admin']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    const theme = await Theme.findOne({ lob }) || {};
    res.render('sop_admin_settings', { lob, theme, user: req.user });
  } catch (err) {
    console.error('Error loading admin settings:', err);
    res.status(500).send('Failed to load admin settings');
  }
});

// Admin full-page panel (no header/search) for managing SOPs
router.get('/admin-panel', checkRole(['Admin']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.query?.lob || req?.body?.lob || req?.session?.user?.lob || req?.user?.lob || 'zomato';
    const theme = await Theme.findOne({ lob }) || {};

    const sops = await Sop.find({ lob }).sort({ 'lastUpdated.at': -1 });
    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });
    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));

    res.render('sop_admin_panel', { categories, theme, user: req.session?.user || req.user, lob });
  } catch (err) {
    console.error('Error loading admin panel:', err);
    res.status(500).send('Failed to load admin panel');
  }
});

module.exports = router;