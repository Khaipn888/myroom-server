const hostelService = require("../services/hostel.service");
const AppError = require("../utils/AppError");
const ResponseFormatter = require("../utils/ResponseFormatter");
const BaseController = require("../utils/BaseController");

exports.create = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const { name, address, floorCount, totalRoom, services = [] } = req.body;

    if (!name || !address) {
      throw new AppError("Thiếu thông tin bắt buộc: name hoặc address", 400);
    }

    const hostel = await hostelService.create({
      ownerId: user.id,
      name: name.trim(),
      address: address.trim(),
      floorCount,
      totalRoom,
      emptyRoom: totalRoom,
      services: Array.isArray(services) ? services : [],
    });

    res.status(201).json(ResponseFormatter.success(hostel, "Tạo mới Hostel thành công"));
  });

exports.update = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const hostelId = req.params.id;
    const { name, address, floorCount, totalRoom, services = [] } = req.body;

    if (!hostelId) {
      throw new AppError("hostel ID là bắt buộc", 400);
    }
    if (name != null && typeof name === "string" && !name.trim()) {
      throw new AppError("Nếu cung cấp name thì phải là chuỗi không rỗng", 400);
    }
    if (address != null && typeof address === "string" && !address.trim()) {
      throw new AppError("Nếu cung cấp address thì phải là chuỗi không rỗng", 400);
    }
    if (floorCount != null && (typeof floorCount !== "number" || floorCount < 0)) {
      throw new AppError("Nếu cung cấp floorCount thì phải là số ≥ 0", 400);
    }
    if (totalRoom != null && (typeof totalRoom !== "number" || totalRoom < 0)) {
      throw new AppError("Nếu cung cấp totalRoom thì phải là số ≥ 0", 400);
    }
    if (services != null && !Array.isArray(services)) {
      throw new AppError("services phải là một mảng", 400);
    }

    const updated = await hostelService.update(hostelId, user.id, {
      name: name != null ? name.trim() : undefined,
      address: address != null ? address.trim() : undefined,
      floorCount,
      totalRoom,
      services: Array.isArray(services) ? services : undefined,
    });

    res.status(200).json(ResponseFormatter.success(updated, "Cập nhật Hostel thành công"));
  });

exports.delete = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const hostelId = req.params.id;
    if (!hostelId) {
      throw new AppError("hostel ID là bắt buộc", 400);
    }
    await hostelService.delete(hostelId, user.id);
    res.json(ResponseFormatter.success(null, "Xóa Hostel thành công"));
  });

exports.getMyHostels = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const code = req.user.code;
    const hostels = await hostelService.getMyHostels(userId, code);
    return res.json(ResponseFormatter.success(hostels, "Lấy danh sách Hostel thành công"));
  });

exports.getHostelDetail = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const code = req.user.code;
    const hostelId = req.params.id;
    if (!hostelId) {
      throw new AppError("hostelId là bắt buộc", 400);
    }
    const detail = await hostelService.getHostelDetail(hostelId, userId, code);
    res.json(ResponseFormatter.success(detail, "Lấy chi tiết Hostel thành công"));
  });
