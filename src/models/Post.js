const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: { type: String, enum: ["home", "room", "co-living"] },
    title: String,
    description: String,
    media: [String],
    address: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    price: Number,
    area: Number,
    utilities: [String],
    peoplePerRoom: { type: String, required: true },
    services: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
        unit: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "actived", "reject", "disabled", "draft", "rented"],
      default: "pending",
    },
    numberOfReport: {
      type: Number,
      default: 0,
    },
    numberOfComment: {
      type: Number,
      default: 0,
    },
    contactPhone: { type: String, required: true },
    contactZalo: String,
    reason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);
