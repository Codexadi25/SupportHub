const express = require('express');
const router = express.Router({ mergeParams: true });
const { isAuthenticated, isAdmin } = require('../../middleware/authMiddleware');
const {
    getTags,
    createTag,
    updateTag,
    deleteTag,
    getPrompt,
    updatePrompt,
    getAdminCands,
    createAdminCand,
    updateAdminCand,
    deleteAdminCand,
    reorderAdminCands,
    generateResponse
} = require('../../controllers/aiCandController');

// Tag management
router.get('/tags', isAuthenticated, getTags);
router.post('/tags', isAuthenticated, createTag);
router.put('/tags/:id', isAuthenticated, updateTag);
router.delete('/tags/:id', isAuthenticated, deleteTag);

// Prompt template management
router.get('/prompt', isAuthenticated, getPrompt);
router.put('/prompt', isAdmin, updatePrompt);

// Admin canned response (AiCand) management
router.get('/admin-cands', isAuthenticated, getAdminCands);
router.post('/admin-cands', isAdmin, createAdminCand);
router.put('/admin-cands/:id', isAdmin, updateAdminCand);
router.delete('/admin-cands/:id', isAdmin, deleteAdminCand);
router.post('/admin-cands/reorder', isAuthenticated, reorderAdminCands);

// Response generation
router.post('/generate', isAuthenticated, generateResponse);

module.exports = router;
