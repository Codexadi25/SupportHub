const express = require('express');
const router = express.Router({ mergeParams: true });
const { 
    createCategory, 
    updateCategory, 
    deleteCategory, 
    addTemplate, 
    updateTemplate, 
    deleteTemplate
} = require('../../controllers/candController');
const { isEditorOrAbove } = require('../../middleware/authMiddleware');

router.post('/category', isEditorOrAbove, createCategory);
router.put('/category/:id', isEditorOrAbove, updateCategory);
router.delete('/category/:id', isEditorOrAbove, deleteCategory);

router.post('/template/:categoryId', isEditorOrAbove, addTemplate);
router.put('/template/:categoryId/:templateId', isEditorOrAbove, updateTemplate);
router.delete('/template/:categoryId/:templateId', isEditorOrAbove, deleteTemplate);

module.exports = router;