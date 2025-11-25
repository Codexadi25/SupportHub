const express = require('express');
const router = express.Router();
const { 
    createCategory, 
    updateCategory, 
    deleteCategory, 
    addTemplate, 
    updateTemplate, 
    deleteTemplate 
} = require('../../controllers/candController');
const { protect, isEditorOrAbove } = require('../../middleware/authMiddleware');

router.post('/category', protect, isEditorOrAbove, createCategory);
router.put('/category/:id', protect, isEditorOrAbove, updateCategory);
router.delete('/category/:id', protect, isEditorOrAbove, deleteCategory);

router.post('/template/:categoryId', protect, isEditorOrAbove, addTemplate);
router.put('/template/:categoryId/:templateId', protect, isEditorOrAbove, updateTemplate);
router.delete('/template/:categoryId/:templateId', protect, isEditorOrAbove, deleteTemplate);

module.exports = router;