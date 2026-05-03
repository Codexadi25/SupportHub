const express = require('express');
const router = express.Router();
const Category = require('./models/category');
const { generateTags } = require('../../autoTagGenerator');  // Import the tag generator

// API to get all tags from the database
router.get('/tags', async (req, res) => {
    try {
        const existingTags = await getExistingTags();
        res.json(existingTags);  // Return existing tags as a response
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tags from database', error });
    }
});

// Example API to generate tags for a given text
router.post('/generate-tags', async (req, res) => {
    try {
        const { text } = req.body;
        const tags = await generateTags(text);  // Generate tags for the input text
        res.json({ tags });
    } catch (error) {
        res.status(500).json({ message: 'Error generating tags', error });
    }
});

module.exports = router;