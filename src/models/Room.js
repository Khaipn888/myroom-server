const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  name: String,
  address: String,
  price: Number,
  services: {
    electricity: Number,
    water: Number,
    wifi: Number,
    others: [{ name: String, price: Number }]
  },
  paymentHistory: [{
    month: String, // e.g. '2025-04'
    total: Number,
    paid: Boolean,
    paidAt: Date
  }],
  furnitureStatus: [{ item: String, condition: String }],
  issues: [{
    title: String,
    description: String,
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
