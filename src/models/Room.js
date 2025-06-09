const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hostel",
      required: true,
      index: true,
    },
    members: [{
      name: String,
      code: String,
      phone: String,
      cccdFront: String,
      cccdBack: String,
    }],
    name: String,
    price: Number,
    area: Number,
    paymentStatus: {
      type: String,
      default: "not-pay"
    },
    prevReadings: {
      electricity : Number,
      water: Number
    },
    furnitureStatus: [{ item: String, condition: String }],
    issues: [
      {
        title: String,
        description: String,
        status: { type: String, enum: ["pending", "resolved"], default: "pending" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
