const mongoose = require("mongoose");

const hostelSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    totalRoom: {
      type: Number,
      default: 0,
    },
    emptyRoom: {
      type: Number,
      default: 0,
    },
    floorCount: {
      type: Number,
    },
    totalMembers: {
      type: Number,
      default: 0,
    },
    services: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
        unit: { type: String, required: true },
      },
    ],
    memberCodes: [String],
    deadline: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Hostel", hostelSchema);
