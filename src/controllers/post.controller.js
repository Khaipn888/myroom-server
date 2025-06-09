const postService = require("../services/post.service");
const AppError = require("../utils/AppError");
const ResponseFormatter = require("../utils/ResponseFormatter");
const BaseController = require("../utils/BaseController");

exports.create = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const {
      type,
      title,
      price,
      area,
      address,
      location,
      media = [],
      peoplePerRoom,
      utilities = [],
      description = "",
      services,
      contactPhone,
      contactZalo,
    } = req.body;

    if (!type || !title || !price || !area || !address || !location || !contactPhone) {
      throw new AppError("Thiếu thông tin bắt buộc", 400);
    }

    const post = await postService.create({
      userId: user.id,
      type,
      title,
      price,
      area,
      address,
      location,
      media,
      peoplePerRoom,
      utilities,
      description,
      services,
      contactPhone,
      contactZalo,
    });

    res.status(201).json(ResponseFormatter.success(post, "Đăng tin thành công"));
  });

exports.searchES = (req, res) =>
  BaseController.handle(req, res, async () => {
    const result = await postService.searchPostsES(req.query);
    res.json(ResponseFormatter.success(result));
  });

exports.suggestions = (req, res) =>
  BaseController.handle(req, res, async () => {
    const q = (req.query.q || "").toString().trim();
    const province = req.query.province?.toString();
    if (!q) {
      // ngay cả khi q rỗng, trả về mảng rỗng (dùng ResponseFormatter để đồng nhất)
      return res.json(ResponseFormatter.success([], "No keyword provided"));
    }
    const list = await postService.getSearchSuggestions({ q, province });
    res.json(ResponseFormatter.success(list, "Suggestion list"));
  });

exports.getDetailPost = (req, res) =>
  BaseController.handle(req, res, async () => {
    const postId = req.params.id;
    if (!postId) {
      throw new AppError("Post ID is required", 400);
    }
    const post = await postService.getDetailPost(postId);

    if (!post) {
      // Nếu không tìm thấy post nào
      return res.json(ResponseFormatter.success(null, "Post not found"));
    }

    // Trả về chi tiết post
    return res.json(ResponseFormatter.success(post, "Post detail"));
  });

exports.getSimilarPosts = (req, res) =>
  BaseController.handle(req, res, async () => {
    const postId = req.params.id;
    if (!postId) {
      throw new AppError("Post ID is required", 400);
    }
    const limit = parseInt(req.query.limit) || 5;
    const similarPosts = await postService.getSimilarPosts(postId, limit);
    return res.json(ResponseFormatter.success(similarPosts, "Similar posts fetched"));
  });

exports.updateStatus = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { postId, newStatus } = req.body;

    if (!postId) {
      throw new AppError("Post ID is required", 400);
    }
    if (!newStatus) {
      throw new AppError("Vui lòng cung cấp status mới", 400);
    }

    // Gọi service để cập nhật status (và điều chỉnh numberOfPost của user, đồng bộ ES)
    const updatedPost = await postService.updateStatus(postId, newStatus);

    return res.json(ResponseFormatter.success(updatedPost, "Cập nhật trạng thái thành công"));
  });
