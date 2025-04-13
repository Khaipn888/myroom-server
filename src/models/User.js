const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  avatar: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  googleId: String,
  refreshToken: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);