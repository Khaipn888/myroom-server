const commentService = require("../services/comment.service");
const BaseController = require("../utils/BaseController");
const ResponseFormatter = require("../utils/ResponseFormatter");

exports.createComment = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const { postId, content, parentId } = req.body;
    const comment = await commentService.createComment(userId, { postId, content, parentId });
    res.json(ResponseFormatter.success(comment, "Bình luận thành công"));
  });

exports.getCommentsByPost = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { postId } = req.params;
    const comments = await commentService.getCommentsByPost(postId);
    res.json(ResponseFormatter.success(comments, "Lấy bình luận thành công"));
  });

exports.deleteComment = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const { commentId } = req.params;
    await commentService.deleteComment(userId, commentId);
    res.json(ResponseFormatter.success("Xoá bình luận thành công"));
  });
