const PostComment = require("../models/PostComment");
const Post = require("../models/Post");
const elasticClient = require("../utils/elasticsearchClient");
const User = require("../models/User");

exports.createComment = async (userId, { postId, content, parentId = null }) => {
  const comment = await PostComment.create({
    postId,
    userId,
    content,
    parentId,
  });
  // Lấy updated post với số bình luận mới nhất
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { numberOfComment: 1 } },
    { new: true }
  );

  // Đồng bộ status mới lên Elasticsearch
  try {
    await elasticClient.update({
      index: "posts",
      id: postId.toString(),
      doc: {
        numberOfComment: updatedPost?.numberOfComment ?? 1,
      },
    });
  } catch (esErr) {
    console.error("❌ Lỗi khi cập nhật Elasticsearch:", esErr);
    // Không throw tiếp để không làm gián đoạn API
  }
  // Populate user để trả về FE đầy đủ thông tin user
  return PostComment.findById(comment._id).populate("userId", "name avatar");
};

exports.getCommentsByPost = async (postId) => {
  // Lấy tất cả comment (chỉ lấy bình luận gốc, nếu cần phân trang thì bổ sung limit/skip)
  const comments = await PostComment.find({ postId, isDeleted: false })
    .populate("userId", "name avatar")
    .sort({ createdAt: 1 });

  return comments;
};

exports.deleteComment = async (userId, commentId) => {
  const comment = await PostComment.findById(commentId);
  if (!comment) throw new Error("Không tìm thấy bình luận");
  if (comment.userId.toString() !== userId.toString()) {
    throw new Error("Bạn không có quyền xoá bình luận này");
  }

  // Soft delete
  comment.isDeleted = true;
  await comment.save();

  // Giảm số bình luận trong Post, không để âm
  let updatedPost = await Post.findByIdAndUpdate(
    comment.postId,
    { $inc: { numberOfComment: -1 } },
    { new: true }
  );
  if (updatedPost && updatedPost.numberOfComment < 0) {
    updatedPost.numberOfComment = 0;
    await updatedPost.save();
  }

  // Đồng bộ số comment lên Elasticsearch
  try {
    await elasticClient.update({
      index: "posts",
      id: comment.postId.toString(),
      doc: {
        numberOfComment: updatedPost?.numberOfComment ?? 0,
      },
    });
  } catch (esErr) {
    console.error("❌ Lỗi khi cập nhật Elasticsearch:", esErr);
    // Không throw để API luôn phản hồi cho FE
  }
};
