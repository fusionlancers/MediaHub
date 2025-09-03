const mongoose = require('mongoose');
const { Schema } = mongoose;

const mediaSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  fileId: { type: Schema.Types.ObjectId, required: true }, // GridFS file id
  filename: { type: String },
  contentType: { type: String },
  uploadDate: { type: Date, default: Date.now },
  userEmail: { type: String, required: true } // Add userEmail to associate media with user
});

module.exports = mongoose.model('Media', mediaSchema);
