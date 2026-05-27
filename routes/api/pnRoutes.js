const express = require('express');
const router = express.Router({ mergeParams: true });
const { getNotes, createNote, updateNote, deleteNote } = require('../../controllers/pnController');
const { isAuthenticated } = require('../../middleware/authMiddleware');

router.route('/')
    .get(isAuthenticated, getNotes)
    .post(isAuthenticated, createNote);

router.route('/:id')
    .put(isAuthenticated, updateNote)
    .delete(isAuthenticated, deleteNote);

module.exports = router;