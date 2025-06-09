const mongoose = require("mongoose");
const { Schema } = mongoose;

const ReportSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    reasons: {
      type: [String],
      required: true,
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: "Phải có ít nhất 1 lý do báo cáo",
      },
    },
    otherReason: {
      type: String,
      default: "",
    },
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const ReportModel = mongoose.model("Report", ReportSchema);
module.exports = ReportModel;
