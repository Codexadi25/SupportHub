// routes/performance.js
const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/performanceController');
const { guard }  = require('../utils/authGuard');

// ── View routes ───────────────────────────────────────────
router.get('/dashboard',        guard, ctrl.viewDashboard);
router.get('/overview',         guard, ctrl.viewOverview);
router.get('/records',          guard, ctrl.viewRecords);
router.get('/performance',      guard, ctrl.viewPerformance);
router.get('/shifts',           guard, ctrl.viewShifts);
router.get('/leaves',           guard, ctrl.viewLeaves);
router.get('/breaks',           guard, ctrl.viewBreaks);
router.get('/behavior',         guard, ctrl.viewBehavior);
router.get('/errors',           guard, ctrl.viewErrors);
router.get('/employee',         guard, ctrl.viewEmployee);
router.get('/trends',           guard, ctrl.viewTrends);
router.get('/upload',           guard, ctrl.viewUpload);
router.get('/export',           guard, ctrl.viewExport);
router.get('/admin/teams',      guard, ctrl.viewTeams);
router.get('/admin/settings',   guard, ctrl.viewSettings);
router.get('/admin/breaks-recorder', guard, ctrl.viewBreaksRecorder);
router.get('/sample.csv',       guard, ctrl.downloadSampleCSV);

// ── Data API ──────────────────────────────────────────────
// Summary & KPIs
router.get('/api/performance/summary',           guard, ctrl.apiSummary);
router.get('/api/performance/trend',             guard, ctrl.apiTrend);
router.get('/api/performance/performance-trend', guard, ctrl.apiPerformanceTrend);
router.get('/api/performance/tickets',           guard, ctrl.apiTickets);
router.get('/api/performance/breaks',            guard, ctrl.apiBreaks);
router.get('/api/performance/week-off',          guard, ctrl.apiWeekOff);
router.get('/api/performance/punctuality',       guard, ctrl.apiPunctuality);
router.get('/api/performance/errors',            guard, ctrl.apiErrors);
router.get('/api/performance/leaderboard',       guard, ctrl.apiLeaderboard);
router.get('/api/performance/shift-swaps',       guard, ctrl.apiShiftSwaps);
router.get('/api/performance/behavior-issues',   guard, ctrl.apiBehaviorIssues);
router.get('/api/performance/records',           guard, ctrl.apiRecords);

// Employee profile
router.get('/api/performance/employee/:userId',          guard, ctrl.apiEmployeeProfile);
router.get('/api/performance/employee/by-empid/:empId',  guard, ctrl.apiEmployeeProfileByEmpId);
router.get('/api/performance/employee/:userId/radar',    guard, ctrl.apiEmployeeRadar);
router.get('/api/performance/employee/:userId/trend',    guard, ctrl.apiEmployeeTrend);
router.get('/api/performance/employee/:userId/breaks',   guard, ctrl.apiEmployeeBreaks);
router.get('/api/performance/employee/:userId/errors',   guard, ctrl.apiEmployeeErrors);
router.get('/api/performance/employee/:userId/behavior', guard, ctrl.apiEmployeeBehavior);

// Shift swap approvals
router.post('/api/performance/shift-swap/:id/approve', guard, ctrl.approveShiftSwap);
router.post('/api/performance/shift-swap/:id/reject',  guard, ctrl.rejectShiftSwap);

// Bulk upload
router.post('/api/performance/bulk-upload', guard, ctrl.bulkUpload);

// Settings API routes
router.get('/api/performance/settings', guard, ctrl.apiGetSettings);
router.post('/api/performance/settings', guard, ctrl.apiSaveSettings);

// Break Recorder API routes
router.get('/api/performance/break-recorder/users', guard, ctrl.apiGetBreakRecorderUsers);
router.post('/api/performance/break-recorder/toggle', guard, ctrl.apiToggleAgentBreaks);

// Demo Data Seeding & Purging
router.post('/api/performance/demo/seed', guard, ctrl.seedDemo);
router.post('/api/performance/demo/clear', guard, ctrl.clearDemo);

// Export & Share
router.get('/api/performance/export/xlsx', guard, ctrl.exportXLSX);
router.get('/api/performance/export/csv',  guard, ctrl.exportCSV);
router.get('/api/performance/export/pdf',  guard, ctrl.exportPDF);
router.post('/api/performance/share/link', guard, ctrl.generateShareLink);
router.get('/api/performance/view/:token',       ctrl.viewSharedReport); // public — no guard

// Encrypted Public Shared Reports (Auto-destruct TTL API)
router.post('/api/performance/share/encrypted-api', guard, ctrl.generateEncryptedApiLink);
router.get('/api/performance/shared-report/:token',        ctrl.viewEncryptedSharedReport); // public — no guard

module.exports = router;
