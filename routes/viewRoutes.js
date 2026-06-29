const express = require('express');
const router = express.Router();
const { getLoginPage, getRegisterPage, getAppPage } = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Public landing page — accessible to all (also reachable via /home)
router.get('/home', (req, res) => {
    res.render('home', { user: req.session?.user || null });
});

router.get('/login', getLoginPage);
router.get('/register', getRegisterPage);

// Root: show home page for guests, load the app for authenticated users
router.get('/', (req, res, next) => {
    if (req.session && req.session.user) {
        // Logged-in → load the full dashboard/app
        return getAppPage(req, res, next);
    }
    // Guest → show the landing page
    res.render('home', { user: null });
});


// Brand new premium legal pages (accessible publicly)
router.get('/terms', (req, res) => {
    res.render('terms', { user: req.session?.user || null });
});

router.get('/privacy', (req, res) => {
    res.render('privacy', { user: req.session?.user || null });
});

// SOP Admin and Creation Routes
const { SopTemplate, Sop } = require('../models/Sop');
const Department = require('../models/Department');

router.get('/sop', isAuthenticated, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) return res.redirect('/login');
        
        const allowedRoles = ['admin', 'quality_analyst', 'editor'];
        const normalizedRole = user.role ? user.role.toLowerCase() : '';
        
        if (!allowedRoles.includes(normalizedRole)) {
            // Auto redirect to the new smart SOP view route
            const dept = (user.department || 'zomato').toLowerCase();
            const lob = (user.lob || dept).toLowerCase();
            return res.redirect(`/sop/${dept}/${lob}/view`);
        }

        const templates = await SopTemplate.find().lean();
        for (const t of templates) {
            t.cardCount = await Sop.countDocuments({ lob: t.lob, status: 'Published' });
        }

        const departments = await Department.find({ isActive: true }).lean();
        res.render('sop_admin', { templates, departments, user });
    } catch (err) {
        console.error('Error in /sop route:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

router.post('/sop/new', isAuthenticated, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) return res.status(401).json({ error: 'Authentication required' });

        const allowedRoles = ['admin', 'quality_analyst', 'editor'];
        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden: Only Admins, Quality Analysts, and Editors can create SOPs.' });
        }

        const { lobName, lobSlug, department } = req.body;
        if (!lobName || !lobName.trim()) {
            return res.status(400).json({ error: 'LOB Name is required' });
        }

        const finalSlug = (lobSlug || lobName).trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        if (!finalSlug) {
            return res.status(400).json({ error: 'Invalid LOB route slug' });
        }

        const exists = await SopTemplate.findOne({ lob: finalSlug });
        if (exists) {
            return res.status(400).json({ error: `An SOP for LOB "${finalSlug}" already exists.` });
        }

        const finalDept = user.role === 'admin' ? (department || 'zomato') : (user.department || 'zomato');

        const template = await SopTemplate.create({
            lob: finalSlug,
            department: finalDept.toLowerCase().trim(),
            title: lobName.trim(),
            headerImage: '',
            googleSheetUrl: '',
            categories: [],
            sidebarConfig: {
                calculator: true,
                callingScript: '"Thank you for contacting customer support. My name is [Agent Name]. How can I assist you today?"',
                quickPrompts: [
                    { label: "General Inquiries", text: "I would be happy to check the details and update you. Please hold on for a moment." }
                ],
                recentUpdates: [
                    { date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-'), text: `Default SOP template initialized for ${finalSlug}.` }
                ]
            }
        });

        res.status(201).json({ success: true, lob: template.lob, department: template.department });
    } catch (err) {
        console.error('Error in /sop/new:', err);
        res.status(500).json({ error: 'Server Error: ' + err.message });
    }
});

router.delete('/sop/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const user = req.session.user;
        if (!user || !['admin', 'quality_analyst', 'editor'].includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        const template = await SopTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'SOP Template not found' });
        }
        
        // Also delete all SOP cards associated with this lob
        await Sop.deleteMany({ lob: template.lob });
        
        await SopTemplate.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting SOP:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;