const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PostCommentSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // Nếu muốn bình luận con (reply), bổ sung:
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "PostComment",
      default: null,
    },
  },
  {
    timestamps: true, // tạo trường createdAt, updatedAt
  }
);

module.exports = mongoose.model("PostComment", PostCommentSchema);
