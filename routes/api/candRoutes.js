const express = require('express');
const router = express.Router({ mergeParams: true });
const { 
    createCategory, 
    updateCategory, 
    deleteCategory, 
    addTemplate, 
    updateTemplate, 
    deleteTemplate,
    generateAiTemplate,
    rephraseAiTemplate
} = require('../../controllers/candController');
const { isEditorOrAbove, isAuthenticated } = require('../../middleware/authMiddleware');

router.post('/category', isEditorOrAbove, createCategory);
router.put('/category/:id', isEditorOrAbove, updateCategory);
router.delete('/category/:id', isEditorOrAbove, deleteCategory);

router.post('/template/:categoryId', isEditorOrAbove, addTemplate);
router.put('/template/:categoryId/:templateId', isEditorOrAbove, updateTemplate);
router.delete('/template/:categoryId/:templateId', isEditorOrAbove, deleteTemplate);

router.post('/generate-ai', isAuthenticated, generateAiTemplate);
router.post('/rephrase-ai', isAuthenticated, rephraseAiTemplate);

module.exports = router;