const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    code: {
      type: String,
      required: true,
      unique: true,
    },
    otpCode: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    password: String,
    phone: String,
    avatar: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    googleId: String,
    refreshToken: { type: String },
    numberOfPost: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
