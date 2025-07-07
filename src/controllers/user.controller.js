const userService = require("../services/user.service");
const BaseController = require("../utils/BaseController");
const ResponseFormatter = require("../utils/ResponseFormatter");
const AppError = require("../utils/AppError");

// Lưu tin
exports.savePost = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { postId } = req.body;
    const userId = req.user.id;

    if (!postId) {
      throw new AppError("Thiếu postId", 400);
    }

    const result = await userService.savePost(userId, postId);
    res.json(ResponseFormatter.success(result, "Đã lưu tin thành công"));
  });

// Bỏ lưu tin
exports.unsavePost = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { postId } = req.body;
    const userId = req.user.id;

    if (!postId) {
      throw new AppError("Thiếu postId", 400);
    }

    const result = await userService.unsavePost(userId, postId);
    res.json(ResponseFormatter.success(result, "Đã bỏ lưu tin"));
  });

// Lấy danh sách tin đã lưu
exports.getSavedPosts = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const { keyword = "", page = "1", limit = "10", sort = "createdAt:desc" } = req.query;
    const typeArray = req.query["type[]"] || [];

    const result = await userService.getMySavedPosts(userId, {
      type: typeArray,
      keyword: keyword.trim(),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: sort.trim(),
    });
    res.json(ResponseFormatter.success(result, "Lấy danh sách tin đã lưu thành công"));
  });

exports.getAllMyPosts = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const { keyword = "", page = "1", limit = "10", sort = "createdAt:desc" } = req.query;
    const statusArray = req.query["status[]"] || [];
    const typeArray = req.query["type[]"] || [];

    const result = await userService.getAllMyPosts(userId, {
      status: statusArray,
      type: typeArray,
      keyword: keyword.trim(),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: sort.trim(),
    });

    res.json(ResponseFormatter.success(result, "Lấy danh sách tin cá nhân thành công"));
  });

exports.getMyPostSearchSuggestions = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const q = (req.query.q || "").toString();

    const suggestions = await userService.getMyPostSearchSuggestions({
      userId,
      q,
    });

    res.json(ResponseFormatter.success(suggestions, "Gợi ý tìm kiếm tin của bạn"));
  });

exports.updateMe = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const { name, phone, email, address, gender, avatar } = req.body;

    // Validate tối thiểu
    if (!name || !phone) {
      throw new AppError("Thiếu thông tin bắt buộc: name hoặc phone", 400);
    }

    const updatedUser = await userService.updateMe(userId, {
      name,
      phone,
      email,
      address,
      gender,
      avatar,
    });

    res.json(ResponseFormatter.success(updatedUser, "Cập nhật thông tin người dùng thành công"));
  });

exports.getAllPostsByAdmin = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { keyword = "", page = "1", limit = "10", sort = "createdAt:desc" } = req.query;
    const statusArray = req.query["status[]"] || [];
    const typeArray = req.query["type[]"] || [];

    const result = await userService.getAllPostsByAdmin({
      status: statusArray,
      type: typeArray,
      keyword: keyword.trim(),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: sort.trim(),
    });

    res.json(ResponseFormatter.success(result, "Lấy danh sách tất cả tin đăng thành công"));
  });

exports.getPostSearchSuggestionsForAdmin = (req, res) =>
  BaseController.handle(req, res, async () => {
    const q = (req.query.q || "").toString();

    const suggestions = await userService.getPostSearchSuggestionsForAdmin({
      q,
    });

    res.json(ResponseFormatter.success(suggestions, "Gợi ý tìm kiếm tin của bạn"));
  });

exports.getAllUsersByAdmin = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { keyword = "", page = "1", limit = "10", sort = "createdAt:desc" } = req.query;
    const statusArray = req.query["status[]"] || [];
    const roleArray = req.query["roles[]"] || [];

    const result = await userService.getAllUsersByAdmin({
      status: statusArray,
      roles: roleArray,
      keyword: keyword.trim(),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: sort.trim(),
    });

    res.json(ResponseFormatter.success(result, "Lấy danh sách tất cả người dùng thành công"));
  });

exports.suggestUserByKeyword = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { keyword = "" } = req.query;
    if (!keyword.trim()) {
      return res.json(ResponseFormatter.success([], "Không có từ khoá"));
    }
    const result = await userService.suggestUserByKeyword(keyword.trim());
    res.json(ResponseFormatter.success(result, "Gợi ý tìm kiếm thành công"));
  });


exports.lockUser = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { userId, reason } = req.body;
    if (!userId) throw new AppError("Thiếu userId", 400);

    const result = await userService.setUserStatus(userId, "locked", reason);
    res.json(ResponseFormatter.success(result, "Khoá tài khoản thành công"));
  });

exports.unlockUser = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { userId } = req.body;
    if (!userId) throw new AppError("Thiếu userId", 400);

    const result = await userService.setUserStatus(userId, "actived");
    res.json(ResponseFormatter.success(result, "Mở khoá tài khoản thành công"));
  });