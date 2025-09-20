// src/routes/media.js
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { Readable } = require('stream');
const Media = require('../models/media');
require('dotenv').config();

const router = express.Router();

// Use Multer memory storage (files come in req.file.buffer)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

// GridFS bucket will be created once mongoose connection is ready
let bucket;
mongoose.connection.once('open', () => {
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  console.log('✅ GridFSBucket initialized (bucket: uploads)');
});

// --- Render upload form ---
router.get('/upload', (req, res) => {
  res.render('upload'); // views/upload.ejs
});

// --- Handle upload: receive file in memory -> pipe to GridFS ---
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!bucket) return res.status(500).send('GridFS not initialized');
    if (!req.file) return res.status(400).send('No file uploaded');

    // Create a readable stream from the buffer
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);

    // Open an upload stream to GridFS
    const uploadStream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });

    // Pipe the file buffer into GridFS
    readable.pipe(uploadStream)
      .on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).send('Upload failed');
      })
      .on('finish', async (file) => {
        // Use uploadStream.id and uploadStream.filename if file is undefined
        const fileId = (file && file._id) ? file._id : uploadStream.id;
        const filename = (file && file.filename) ? file.filename : req.file.originalname;
        const contentType = (file && file.contentType) ? file.contentType : req.file.mimetype;
        if (!fileId) {
          console.error('Upload finished but fileId is undefined');
          return res.status(500).send('Upload failed: file not saved');
        }
        // Save metadata in Media collection
        const userEmail = req.session && req.session.userEmail ? req.session.userEmail : null;
        if (!userEmail) {
          return res.status(401).send('Unauthorized: No user session');
        }
        const doc = new Media({
          title: req.body.title || req.file.originalname,
          description: req.body.description || '',
          fileId,
          filename,
          contentType,
          userEmail
        });
        await doc.save();
        console.log('Uploaded:', filename, 'id:', fileId.toString());
        res.redirect('/media');
      });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error during upload');
  }
});

// --- List all media (render) ---
// List only media uploaded by the logged-in user
router.get('/', async (req, res) => {
  try {
    const userEmail = req.session && req.session.userEmail ? req.session.userEmail : null;
    if (!userEmail) {
      return res.status(401).send('Unauthorized: No user session');
    }
    const media = await Media.find({ userEmail }).sort({ uploadDate: -1 }).lean();
    res.render('list', { media });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// --- Stream file by GridFS file id ---
router.get('/file/:id', async (req, res) => {
  try {
    if (!bucket) return res.status(500).send('GridFS not initialized');
    const fileId = new mongoose.Types.ObjectId(req.params.id);

    // Get file metadata from uploads.files collection
    const filesColl = mongoose.connection.db.collection('uploads.files');
    const fileDoc = await filesColl.findOne({ _id: fileId });
    if (!fileDoc) return res.status(404).send('File not found');

    res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
    // If ?download=true, set Content-Disposition to attachment
    if (req.query.download === 'true') {
      res.set('Content-Disposition', `attachment; filename="${fileDoc.filename}"`);
    }
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      console.error('Download stream error', err);
      res.status(500).end();
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(400).send('Invalid id');
  }
});

// --- Delete file (GridFS + metadata) ---
router.get('/delete/:id', async (req, res) => {
  try {
    if (!bucket) return res.status(500).send('GridFS not initialized');
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    // Delete from GridFS
    await bucket.delete(fileId);
    // Delete metadata
    await Media.findOneAndDelete({ fileId });
    console.log('Deleted fileId:', fileId.toString());
    res.redirect('/media');
  } catch (err) {
    console.error('Delete error', err);
    res.status(500).send('Delete failed');
  }
});

// --- Update metadata (title/description) ---
router.post('/update/:id', async (req, res) => {
  try {
    await Media.findByIdAndUpdate(req.params.id, {
      title: req.body.title,
      description: req.body.description
    });
    res.redirect('/media');
  } catch (err) {
    console.error('Update error', err);
    res.status(500).send('Update failed');
  }
});

module.exports = router;

