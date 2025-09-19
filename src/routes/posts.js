const express = require('express');
const router = express.Router();
const Media = require('../models/Media');


// GET /api/posts?page=1&limit=10
router.get('/', async (req, res) => {
const page = Math.max(1, parseInt(req.query.page) || 1);
const limit = Math.min(50, parseInt(req.query.limit) || 10);
const skip = (page - 1) * limit;


try {
const [posts, total] = await Promise.all([
Media.find()
.sort({ uploadDate: -1 })
.skip(skip)
.limit(limit)
.lean(),
Media.countDocuments()
]);


// Format posts (convert ObjectId -> string) to be JSON-friendly
const formatted = posts.map(p => ({
id: p._id?.toString(),
title: p.title,
description: p.description,
fileId: p.fileId ? p.fileId.toString() : null,
filename: p.filename,
contentType: p.contentType,
uploadDate: p.uploadDate,
userEmail: p.userEmail
}));


res.json({ posts: formatted, page, limit, total, hasMore: skip + posts.length < total });
} catch (err) {
console.error('Error fetching posts', err);
res.status(500).json({ error: 'Server error' });
}
});


module.exports = router;
