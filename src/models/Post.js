const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['rent', 'share', 'pass'], required: true },
  title: String,
  description: String,
  images: [String],
  video: String,
  location: {
    address: String,
    ward: String,
    district: String,
    city: String,
    coordinates: {
      type: [Number], // [lng, lat]
      index: '2dsphere'
    }
  },
  price: Number,
  area: Number,
  utilities: {
    hasWifi: Boolean,
    hasParking: Boolean,
    hasAirConditioner: Boolean,
    hasWC: Boolean,
    hasKitchen: Boolean,
    hasSecurity: Boolean
  },
  tags: [String],
  status: { type: String, enum: ['available', 'rented'], default: 'available' },
  reports: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String
  }],
  views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
