const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const adminController = require('../controllers/adminController');
const { isVendorOrAdmin, isUserManager, isEditorOrAbove } = require('../middleware/authMiddleware');

// mount this router under /api/admin in app.js

// Cands bulk upload (multipart JSON file)
router.post('/bulk-upload-cands', isVendorOrAdmin, upload.single('jsonFile'), adminController.bulkUploadCands);

// Logs
router.get('/logs', isVendorOrAdmin, adminController.getLogs);
router.post('/cleanup-logs', isVendorOrAdmin, adminController.cleanupLogs);

router.get('/users', isUserManager, adminController.getUsers);
router.get('/teams', isUserManager, adminController.getTeams);
router.put('/users/:id/role', isUserManager, adminController.updateUserRole);
router.put('/users/:id/password', isVendorOrAdmin, adminController.updateUserPassword);
router.post('/users/:id/reset-password', isVendorOrAdmin, adminController.resetUserPassword);
router.delete('/users/:id', isUserManager, adminController.deleteUser);

// Bulk create users (admin/vendor)
router.post('/users/bulk', isVendorOrAdmin, adminController.bulkCreateUsers);

// Feedback & Comments deletion
router.delete('/feedback/:id', isVendorOrAdmin, adminController.deleteFeedback);
router.delete('/comments/:id', isVendorOrAdmin, adminController.deleteComment);

// User activity stats — presence tracked via Firebase RTDB on the client
router.get('/user-activity-stats', isUserManager, adminController.getUserActivityStats);

// Departments CRUD
router.get('/departments', isUserManager, adminController.getDepartments);
router.post('/departments', isVendorOrAdmin, adminController.createDepartment);

// Permitted Word List Management
router.get('/permitted-words', isEditorOrAbove, adminController.getPermittedWords);
router.post('/permitted-words', isVendorOrAdmin, adminController.addPermittedWord);
router.delete('/permitted-words/:id', isVendorOrAdmin, adminController.deletePermittedWord);
router.post('/sync-permitted-words', isVendorOrAdmin, adminController.syncPermittedWords);

module.exports = router;