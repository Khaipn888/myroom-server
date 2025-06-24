const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,            
  },
  type: String, // ex: 'newMessage', 'postStatus', etc.
  content: String,
  isRead: { type: Boolean, default: false },
  metadata: {
    type: Object,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
