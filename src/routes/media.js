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

// --- Stream file for preview (for feed display) with range support ---
router.get('/preview/:id', async (req, res) => {
  try {
    if (!bucket) {
      console.error('GridFS bucket not initialized');
      return res.status(500).send('GridFS not initialized');
    }
    
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    console.log('Preview request for fileId:', fileId.toString());

    // Get file metadata from uploads.files collection
    const filesColl = mongoose.connection.db.collection('uploads.files');
    const fileDoc = await filesColl.findOne({ _id: fileId });
    
    if (!fileDoc) {
      console.error('File not found in GridFS:', fileId.toString());
      return res.status(404).send('File not found');
    }

    const fileSize = fileDoc.length;
    const contentType = fileDoc.contentType || 'application/octet-stream';
    console.log('Streaming file:', fileDoc.filename, 'type:', contentType, 'size:', fileSize);

    res.set('Content-Type', contentType);
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    const range = req.headers.range;
    if (range) {
      console.log('Range request:', range);
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (end > fileSize - 1) end = fileSize - 1;
      const chunksize = (end - start) + 1;

      if (start >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.set('Content-Length', chunksize);

      const downloadStream = bucket.openDownloadStream(fileId, { start, end: end + 1 }); // end is exclusive
      downloadStream.on('error', (err) => {
        console.error('Preview range stream error for', fileId.toString(), ':', err);
        if (!res.headersSent) res.status(500).end();
      });
      downloadStream.pipe(res);
    } else {
      res.set('Content-Length', fileSize);
      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.on('error', (err) => {
        console.error('Preview full stream error for', fileId.toString(), ':', err);
        if (!res.headersSent) res.status(500).end();
      });
      downloadStream.pipe(res);
    }
  } catch (err) {
    console.error('Preview route error:', err);
    if (!res.headersSent) {
      res.status(400).send('Invalid file ID');
    }
  }
});

// --- Render upload form ---
router.get('/upload', (req, res) => {
  res.render('upload'); // views/upload.ejs
});

// --- Handle upload: receive file in memory -> pipe to GridFS ---
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!bucket) {
      console.error('GridFS bucket not initialized');
      return res.status(500).send('GridFS not initialized');
    }
    
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).send('No file uploaded');
    }

    console.log('Uploading file:', req.file.originalname, 'size:', req.file.size, 'type:', req.file.mimetype);

    // Create a readable stream from the buffer
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);

    // Open an upload stream to GridFS
    const uploadStream = bucket.openUploadStream(req.file.originalname, { 
      contentType: req.file.mimetype,
      metadata: { uploadedBy: req.session?.userEmail }
    });

    // Pipe the file buffer into GridFS
    readable.pipe(uploadStream)
      .on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).send('Upload failed');
      })
      .on('finish', async () => {
        console.log('Upload finished, fileId:', uploadStream.id.toString());
        
        if (!uploadStream.id) {
          console.error('Upload finished but fileId is undefined');
          return res.status(500).send('Upload failed: file not saved');
        }

        // Save metadata in Media collection
        const userEmail = req.session && req.session.userEmail ? req.session.userEmail : null;
        if (!userEmail) {
          console.error('No user session found');
          return res.status(401).send('Unauthorized: No user session');
        }

        const doc = new Media({
          title: req.body.title || req.file.originalname,
          description: req.body.description || '',
          fileId: uploadStream.id,
          filename: req.file.originalname,
          contentType: req.file.mimetype,
          userEmail,
          uploadDate: new Date()
        });
        
        await doc.save();
        console.log('✅ Uploaded and saved metadata:', req.file.originalname, 'id:', uploadStream.id.toString());
        res.redirect('/media');
      });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).send('Server error during upload');
  }
});

// --- List all media (render) ---
// List only media uploaded by the logged-in user
router.get('/', async (req, res) => {
  try {
    const userEmail = req.session && req.session.userEmail ? req.session.userEmail : null;
    if (!userEmail) {
      console.error('No user session for media list');
      return res.status(401).send('Unauthorized: No user session');
    }
    
    const media = await Media.find({ userEmail }).sort({ uploadDate: -1 }).lean();
    console.log(`Found ${media.length} media items for user: ${userEmail}`);
    res.render('list', { media });
  } catch (err) {
    console.error('Media list error:', err);
    res.status(500).send('Server error');
  }
});

// --- Stream file by GridFS file id ---
router.get('/file/:id', async (req, res) => {
  try {
    if (!bucket) {
      console.error('GridFS bucket not initialized');
      return res.status(500).send('GridFS not initialized');
    }
    
    const fileId = new mongoose.Types.ObjectId(req.params.id);

    // Get file metadata from uploads.files collection
    const filesColl = mongoose.connection.db.collection('uploads.files');
    const fileDoc = await filesColl.findOne({ _id: fileId });
    
    if (!fileDoc) {
      console.error('File not found for download:', fileId.toString());
      return res.status(404).send('File not found');
    }

    res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
    // If ?download=true, set Content-Disposition to attachment
    if (req.query.download === 'true') {
      res.set('Content-Disposition', `attachment; filename="${fileDoc.filename}"`);
    }
    
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      console.error('Download stream error', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Download route error:', err);
    if (!res.headersSent) {
      res.status(400).send('Invalid id');
    }
  }
});

// --- Delete file (GridFS + metadata) ---
router.get('/delete/:id', async (req, res) => {
  try {
    if (!bucket) {
      console.error('GridFS bucket not initialized');
      return res.status(500).send('GridFS not initialized');
    }
    
    const mediaId = new mongoose.Types.ObjectId(req.params.id);
    const mediaDoc = await Media.findById(mediaId);
    
    if (!mediaDoc) {
      console.error('Media document not found:', mediaId.toString());
      return res.status(404).send('Media not found');
    }
    
    const fileId = mediaDoc.fileId;
    console.log('Deleting fileId:', fileId.toString());
    
    // Delete from GridFS
    await bucket.delete(fileId);
    // Delete metadata
    await Media.findByIdAndDelete(mediaId);
    
    console.log('✅ Deleted fileId:', fileId.toString());
    res.redirect('/media');
  } catch (err) {
    console.error('Delete error', err);
    res.status(500).send('Delete failed');
  }
});

// --- Update metadata (title/description) ---
router.post('/update/:id', async (req, res) => {
  try {
    const mediaId = req.params.id;
    const updateData = {
      title: req.body.title,
      description: req.body.description
    };
    
    const result = await Media.findByIdAndUpdate(mediaId, updateData, { new: true });
    if (!result) {
      return res.status(404).send('Media not found');
    }
    
    console.log('Updated media:', mediaId);
    res.redirect('/media');
  } catch (err) {
    console.error('Update error', err);
    res.status(500).send('Update failed');
  }
});

module.exports = router;
