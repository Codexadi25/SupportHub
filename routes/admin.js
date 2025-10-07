const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const adminController = require('../controllers/adminController');
const { isVendorOrAdmin, isUserManager } = require('../middleware/authMiddleware');

// mount this router under /api/admin in app.js

// Cands bulk upload (multipart JSON file)
router.post('/bulk-upload-cands', isVendorOrAdmin, upload.single('jsonFile'), adminController.bulkUploadCands);

// Logs
router.get('/logs', isVendorOrAdmin, adminController.getLogs);
router.post('/cleanup-logs', isVendorOrAdmin, adminController.cleanupLogs);

// Users management (admin-only)
router.get('/users', isUserManager, adminController.getUsers);
router.put('/users/:id/role', isUserManager, adminController.updateUserRole);
router.put('/users/:id/password', isUserManager, adminController.updateUserPassword);
router.post('/users/:id/reset-password', isUserManager, adminController.resetUserPassword);
router.delete('/users/:id', isUserManager, adminController.deleteUser);

// Bulk create users (admin)
router.post('/users/bulk', isVendorOrAdmin, adminController.bulkCreateUsers);

module.exports = router;