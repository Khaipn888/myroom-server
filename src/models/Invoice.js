const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hostel",
      required: true,
    },
    price: Number,
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    issuedDate: {
      type: Date,
      required: true,
    },
    water: {
      pre: Number,
      after: Number,
    },
    elec: {
      pre: Number,
      after: Number,
    },
    services: [
      {
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
        },
        unit: {
          type: String,
        },
        amount: {
          type: Number,
          required: true,
        },
      },
    ],
    totalMembers: Number,
    totalAmount: {
      type: Number,
      required: true,
    },
    images: [String],
    status: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"],
      default: "UNPAID",
      index: true,
    },
    isVerify: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
