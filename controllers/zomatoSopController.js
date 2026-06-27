const { Sop, Audit } = require('../models/Sop');

// Helper to check editor permissions
function canEdit(user) {
    const role = (user?.role || '').toLowerCase();
    return ['admin', 'quality_analyst', 'editor'].includes(role);
}

// GET /zomato/WIMO-AI-Handover
exports.getWimoSop = async (req, res) => {
    try {
        const user = req.session?.user || req.user || null;
        const userDept = (user?.department || 'general').toLowerCase().trim();

        // Enforce department access restriction
        if (userDept !== 'zomato') {
            return res.status(403).send('Access Denied: Zomato SOP is restricted to Zomato department users only.');
        }

        // Fetch all cards for WIMO-AI-Handover sorted by order
        const sops = await Sop.find({ lob: 'WIMO-AI-Handover' }).sort({ order: 1 });

        // Group cards by category
        const categoriesMap = {};
        sops.forEach(s => {
            const cat = s.category || 'General';
            if (!categoriesMap[cat]) {
                categoriesMap[cat] = {
                    category: cat,
                    phase: s.phase || '',
                    items: []
                };
            }
            // Only push placeholder if there are no other items or keep it for empty check
            categoriesMap[cat].items.push(s);
        });

        // Convert map to array and sort alphabetically by category name
        const categories = Object.values(categoriesMap).sort((a, b) => a.category.localeCompare(b.category));

        // Get all unique tags dynamically
        const allTags = Array.from(new Set(sops.flatMap(s => s.tags || []))).sort();

        // Render the view
        res.render('sop_interactive', {
            categories,
            allTags,
            user,
            lob: 'WIMO-AI-Handover'
        });
    } catch (err) {
        console.error('getWimoSop error:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
};

// POST /api/sop/category (Create Category)
exports.createCategory = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { category, phase } = req.body;
        if (!category) return res.status(400).json({ error: 'Category name required' });

        // Check if category already exists
        const exists = await Sop.findOne({ lob: 'WIMO-AI-Handover', category });
        if (exists) return res.status(400).json({ error: 'Category already exists' });

        // Find max order
        const maxOrderSop = await Sop.findOne({ lob: 'WIMO-AI-Handover' }).sort({ order: -1 });
        const nextOrder = maxOrderSop ? (maxOrderSop.order + 1) : 0;

        // Create a placeholder card so the category is saved in database
        const placeholder = new Sop({
            lob: 'WIMO-AI-Handover',
            category,
            phase: phase || '',
            title: 'Placeholder Card',
            condition: 'Default condition',
            action: 'Action',
            details: 'Change this card content to get started.',
            tags: ['new'],
            order: nextOrder,
            status: 'Published',
            lastUpdated: {
                at: new Date(),
                by: req.user.username || 'admin',
                role: req.user.role || 'admin'
            }
        });

        await placeholder.save();
        res.json({ success: true, message: 'Category created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/sop/category (Update Category)
exports.updateCategory = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { oldCategory, newCategory, phase } = req.body;
        if (!oldCategory || !newCategory) return res.status(400).json({ error: 'Category names required' });

        const updateData = { category: newCategory };
        if (phase !== undefined) updateData.phase = phase;

        await Sop.updateMany({ lob: 'WIMO-AI-Handover', category: oldCategory }, updateData);
        res.json({ success: true, message: 'Category updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/sop/category (Delete Category)
exports.deleteCategory = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { category } = req.body;
        if (!category) return res.status(400).json({ error: 'Category name required' });

        await Sop.deleteMany({ lob: 'WIMO-AI-Handover', category });
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sop/card (Create Card)
exports.createCard = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { category, phase, title, condition, action, details, tags } = req.body;
        if (!category || !title) return res.status(400).json({ error: 'Category and title required' });

        const maxOrderSop = await Sop.findOne({ lob: 'WIMO-AI-Handover' }).sort({ order: -1 });
        const nextOrder = maxOrderSop ? (maxOrderSop.order + 1) : 0;

        const tagArray = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [];

        const newSop = new Sop({
            lob: 'WIMO-AI-Handover',
            category,
            phase: phase || '',
            title,
            condition: condition || '',
            action: action || '',
            details: details || '',
            tags: tagArray,
            order: nextOrder,
            status: 'Published',
            lastUpdated: {
                at: new Date(),
                by: req.user.username || 'admin',
                role: req.user.role || 'admin'
            }
        });

        await newSop.save();
        res.status(201).json({ success: true, data: newSop });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/sop/card/:id (Update Card)
exports.updateCard = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { title, condition, action, details, tags } = req.body;
        
        const sop = await Sop.findById(req.params.id);
        if (!sop) return res.status(404).json({ error: 'Card not found' });

        if (title !== undefined) sop.title = title;
        if (condition !== undefined) sop.condition = condition;
        if (action !== undefined) sop.action = action;
        if (details !== undefined) sop.details = details;
        if (tags !== undefined) {
            sop.tags = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [];
        }

        sop.lastUpdated = {
            at: new Date(),
            by: req.user.username || 'admin',
            role: req.user.role || 'admin'
        };

        await sop.save();
        res.json({ success: true, data: sop });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/sop/card/:id (Delete Card)
exports.deleteCard = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const sop = await Sop.findByIdAndDelete(req.params.id);
        if (!sop) return res.status(404).json({ error: 'Card not found' });
        res.json({ success: true, message: 'Card deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sop/reorder (Swap/Reorder Cards)
exports.reorderCard = async (req, res) => {
    try {
        if (!canEdit(req.user)) return res.status(403).json({ error: 'Unauthorized' });
        const { cardId, direction } = req.body;
        if (!cardId || !direction) return res.status(400).json({ error: 'CardId and direction required' });

        const currentCard = await Sop.findById(cardId);
        if (!currentCard) return res.status(404).json({ error: 'Card not found' });

        const allCards = await Sop.find({ lob: 'WIMO-AI-Handover' }).sort({ order: 1 });
        const index = allCards.findIndex(c => String(c._id) === String(currentCard._id));

        if (direction === 'up' && index > 0) {
            const prevCard = allCards[index - 1];
            const temp = currentCard.order;
            currentCard.order = prevCard.order;
            prevCard.order = temp;
            await currentCard.save();
            await prevCard.save();
        } else if (direction === 'down' && index < allCards.length - 1) {
            const nextCard = allCards[index + 1];
            const temp = currentCard.order;
            currentCard.order = nextCard.order;
            nextCard.order = temp;
            await currentCard.save();
            await nextCard.save();
        }

        res.json({ success: true, message: 'Reordered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
