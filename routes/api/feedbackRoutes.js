const express = require('express');
const router = express.Router();
const Feedback = require('../../models/Feedback');
const { isAuthenticated, isAdmin, isQAOrAbove, isVendorOrAbove } = require('../../middleware/authMiddleware');

// Get all feedback (visible to all users)
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const { type, status, page = 1, limit = 20 } = req.query;
        const filter = {};
        
        if (type) filter.type = type;
        if (status) filter.status = status;
        
        const feedback = await Feedback.find(filter)
            .populate('userId', 'username')
            .populate('adminId', 'username')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Feedback.countDocuments(filter);
        
        res.json({
            feedback,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching feedback', error: error.message });
    }
});

// Get user's own feedback
router.get('/my', isAuthenticated, async (req, res) => {
    try {
        const sessionUser = req.session.user || {};
        const currentUserId = sessionUser._id || sessionUser.id;
        const feedback = await Feedback.find({ userId: currentUserId })
            .populate('adminId', 'username')
            .sort({ createdAt: -1 });
        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching your feedback', error: error.message });
    }
});

// Submit new feedback
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const { type, title, description, priority = 'medium', tags = [], isPublic = false } = req.body;
        const sessionUser = req.session.user || {};
        const currentUserId = sessionUser._id || sessionUser.id;
        
        const feedback = new Feedback({
            userId: currentUserId,
            username: sessionUser.username,
            type,
            title,
            description,
            priority,
            tags,
            isPublic
        });
        
        await feedback.save();
        res.status(201).json({ message: 'Feedback submitted successfully', feedback });
    } catch (error) {
        res.status(400).json({ message: 'Error submitting feedback', error: error.message });
    }
});

// Update feedback status (quality_analyst, vendor, admin)
router.put('/:id/status', isAuthenticated, isQAOrAbove, async (req, res) => {
    try {
        const { status, adminResponse } = req.body;
        const sessionUser = req.session.user || {};
        
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        feedback.status = status;
        if (adminResponse) feedback.adminResponse = adminResponse;
        feedback.adminId = sessionUser._id || sessionUser.id;
        
        await feedback.save();
        res.json({ message: 'Feedback status updated', feedback });
    } catch (error) {
        res.status(400).json({ message: 'Error updating feedback', error: error.message });
    }
});

// Vote on feedback
router.post('/:id/vote', isAuthenticated, async (req, res) => {
    try {
        const { voteType } = req.body; // 'upvote' or 'downvote'
        const feedback = await Feedback.findById(req.params.id);
        
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        if (!feedback.isPublic) {
            return res.status(403).json({ message: 'Cannot vote on private feedback' });
        }
        
        const sessionUser = req.session.user || {};
        const userId = sessionUser._id || sessionUser.id;
        
        // Remove existing votes
        feedback.upvotes = feedback.upvotes.filter(id => String(id) !== String(userId));
        feedback.downvotes = feedback.downvotes.filter(id => String(id) !== String(userId));
        
        // Add new vote
        if (voteType === 'upvote') {
            feedback.upvotes.push(userId);
        } else if (voteType === 'downvote') {
            feedback.downvotes.push(userId);
        }
        
        await feedback.save();
        res.json({ message: 'Vote recorded', feedback });
    } catch (error) {
        res.status(400).json({ message: 'Error voting on feedback', error: error.message });
    }
});

// Delete feedback (vendor or admin)
router.delete('/:id', isAuthenticated, isVendorOrAbove, async (req, res) => {
    try {
        const feedback = await Feedback.findByIdAndDelete(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting feedback', error: error.message });
    }
});

// Comments: list
router.get('/:id/comments', isAuthenticated, async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id).select('comments');
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });
        res.json({ comments: feedback.comments || [] });
    } catch (error) {
        res.status(400).json({ message: 'Error fetching comments', error: error.message });
    }
});

// Comments: add
router.post('/:id/comments', isAuthenticated, async (req, res) => {
    try {
        const { content, parentId } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ message: 'Comment cannot be empty' });
        }
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });
        const sessionUser = req.session.user || {};
        const currentUserId = sessionUser._id || sessionUser.id;
        
        // Validate parentId if provided
        if (parentId) {
            const parentComment = feedback.comments.id(parentId);
            if (!parentComment) {
                return res.status(400).json({ message: 'Parent comment not found' });
            }
        }
        
        feedback.comments.push({ 
            userId: currentUserId, 
            username: sessionUser.username, 
            content: content.trim(),
            parentId: parentId || null
        });
        await feedback.save();
        res.status(201).json({ message: 'Comment added', comments: feedback.comments });
    } catch (error) {
        res.status(400).json({ message: 'Error adding comment', error: error.message });
    }
});

// Comments: delete (admin, team_lead, vendor, or comment author)
router.delete('/:id/comments/:commentId', isAuthenticated, async (req, res) => {
    try {
        console.log('Delete comment request:', { 
            feedbackId: req.params.id, 
            commentId: req.params.commentId,
            user: req.session.user?.username 
        });
        
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            console.log('Feedback not found:', req.params.id);
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        const sessionUser = req.session.user || {};
        const currentUserId = String(sessionUser._id || sessionUser.id);
        const canModerate = ['admin','team_lead','vendor'].includes(sessionUser.role);
        
        console.log('User info:', { currentUserId, role: sessionUser.role, canModerate });
        
        const comment = feedback.comments.id(req.params.commentId);
        if (!comment) {
            console.log('Comment not found:', req.params.commentId);
            return res.status(404).json({ message: 'Comment not found' });
        }
        
        console.log('Comment info:', { 
            commentUserId: String(comment.userId), 
            canDelete: canModerate || String(comment.userId) === currentUserId 
        });
        
        if (!canModerate && String(comment.userId) !== currentUserId) {
            return res.status(403).json({ message: 'Not authorized to delete this comment' });
        }
        
        comment.remove();
        await feedback.save();
        
        console.log('Comment deleted successfully');
        res.json({ message: 'Comment deleted', comments: feedback.comments });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(400).json({ message: 'Error deleting comment', error: error.message });
    }
});

module.exports = router;

