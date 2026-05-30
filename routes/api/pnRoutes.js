const express = require('express');
const router = express.Router({ mergeParams: true });
const { getNotes, createNote, updateNote, deleteNote } = require('../../controllers/pnController');
const { isAuthenticated, isNotNew } = require('../../middleware/authMiddleware');

router.route('/')
    .get(isAuthenticated, getNotes)
    .post(isAuthenticated, createNote);

router.route('/:id')
    .put(isAuthenticated, isNotNew, updateNote)
    .delete(isAuthenticated, isNotNew, deleteNote);

module.exports = router;