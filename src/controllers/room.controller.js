const roomService = require("../services/room.service");
const AppError = require("../utils/AppError");
const ResponseFormatter = require("../utils/ResponseFormatter");
const BaseController = require("../utils/BaseController");

exports.create = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const { name, price, area, hostelId } = req.body;

    if (!name || !price || !area) {
      throw new AppError("Thiếu thông tin bắt buộc: name hoặc price hoặc area", 400);
    }

    const room = await roomService.create({
      ownerId: user.id,
      name: name.trim(),
      price,
      area,
      hostelId,
    });

    res.status(201).json(ResponseFormatter.success(room, "Tạo mới room thành công"));
  });

exports.update = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const roomId = req.params.id;
    const { name, price, area } = req.body;

    if (!name || !price || !area) {
      throw new AppError("Thiếu thông tin bắt buộc: name hoặc price hoặc area", 400);
    }
    const updated = await roomService.update(roomId, user.id, {
      name: name.trim(),
      price,
      area,
    });
    res.status(200).json(ResponseFormatter.success(updated, "Cập nhật room thành công"));
  });

exports.delete = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const roomId = req.params.id;
    const { hostelId } = req.query;
    if (!roomId) {
      throw new AppError("room ID là bắt buộc", 400);
    }
    await roomService.delete(roomId, user.id, hostelId);
    res.json(ResponseFormatter.success(null, "Xóa room thành công"));
  });

exports.getMyrooms = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const rooms = await roomService.getMyrooms(userId);
    return res.json(ResponseFormatter.success(rooms, "Lấy danh sách room thành công"));
  });

exports.getroomDetail = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const code = req.user.code;
    const roomId = req.params.id;
    if (!roomId) {
      throw new AppError("roomId là bắt buộc", 400);
    }
    const detail = await roomService.getRoomDetail(roomId, userId, code);
    res.json(ResponseFormatter.success(detail, "Lấy chi tiết room thành công"));
  });

exports.addMember = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const { hostelId, roomId, name, code, phone, cccdFront = "", cccdBack = "" } = req.body;

    if (!name || !phone) {
      throw new AppError("Thiếu thông tin bắt buộc: name, code hoặc phone", 400);
    }

    const updatedRoom = await roomService.addMember(
      hostelId,
      roomId,
      name,
      code,
      phone,
      cccdFront,
      cccdBack
    );

    res.json(ResponseFormatter.success(updatedRoom, "Thêm thành viên vào phòng thành công"));
  });

exports.updateMember = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user; // Đảm bảo middleware auth gán req.user.id
    const memberId = req.params.id;
    const { hostelId, roomId, name, code, phone, cccdFront = "", cccdBack = "" } = req.body;

    if (!name || !code || !phone) {
      throw new AppError("Thiếu thông tin bắt buộc: name, code hoặc phone", 400);
    }

    const updatedRoom = await roomService.updateMember(user.id, {
      memberId,
      hostelId,
      roomId,
      name,
      code,
      phone,
      cccdFront,
      cccdBack,
    });

    res.json(ResponseFormatter.success(updatedRoom, "Cập nhật thành viên thành công"));
  });

exports.deleteMember = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = req.user;
    const { hostelId, roomId } = req.query;
    const memberId  = req.params.id;

    if (!memberId) {
      throw new AppError("memberId là bắt buộc", 400);
    }

    await roomService.deleteMember(user.id, { hostelId, roomId, memberId });

    res.json(ResponseFormatter.success(null, "Xóa thành viên thành công"));
  });
