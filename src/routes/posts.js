const express = require('express');
const router = express.Router();
const Media = require('../models/media');
const collection = require('../config');

// GET /posts?page=1&limit=10
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  try {
    console.log(`Fetching posts: page=${page}, limit=${limit}, skip=${skip}`);
    
    const [posts, total] = await Promise.all([
      Media.find()
        .sort({ uploadDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Media.countDocuments()
    ]);

    console.log(`Found ${posts.length} posts, total: ${total}`);

    // Get user info for all posts
    const userEmails = posts.map(p => p.userEmail).filter(Boolean);
    let emailToName = {};
    
    if (userEmails.length > 0) {
      const users = await collection.find({ email: { $in: userEmails } }).lean();
      users.forEach(u => { 
        emailToName[u.email] = u.name || u.username || 'Unknown User'; 
      });
      console.log(`Found ${users.length} users for ${userEmails.length} emails`);
    }

    // Format posts (convert ObjectId -> string) to be JSON-friendly, include username
    const formatted = posts.map(p => {
      console.log('Formatting post:', p._id, 'fileId:', p.fileId, 'contentType:', p.contentType);
      return {
        id: p._id?.toString(),
        title: p.title || 'Untitled',
        description: p.description || '',
        fileId: p.fileId ? p.fileId.toString() : null,
        filename: p.filename || '',
        contentType: p.contentType || '',
        uploadDate: p.uploadDate || new Date(),
        userEmail: p.userEmail,
        username: emailToName[p.userEmail] || 'Unknown User'
      };
    });

    console.log('Sending formatted posts:', formatted.length);
    res.json({ 
      posts: formatted, 
      page, 
      limit, 
      total, 
      hasMore: skip + posts.length < total 
    });
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
