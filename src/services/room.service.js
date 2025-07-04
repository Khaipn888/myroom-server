const HostelModel = require("../models/Hostel");
const RoomModel = require("../models/Room");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const Notification = require("../models/Notification");
const { getIO } = require("../socket/socket");

exports.create = async ({ ownerId, name, price, area, hostelId }) => {
  if (!ownerId) {
    throw new AppError("ownerId là bắt buộc", 400);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Tên nhà trọ (name) là bắt buộc", 400);
  }
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel tương ứng với hostelId", 404);
  }
  const newRoom = await RoomModel.create({
    ownerId,
    name: name.trim(),
    price,
    area,
    hostelId,
  });

  if (hostel.emptyRoom > 0) {
    hostel.emptyRoom = hostel.emptyRoom - 1;
    await hostel.save();
  }

  return newRoom;
};

exports.update = async (roomId, ownerId, { name, price, area }) => {
  const existing = await RoomModel.findById(roomId);
  if (!existing) {
    throw new AppError("Không tìm thấy Hostel", 404);
  }
  if (existing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Bạn không có quyền chỉnh sửa Hostel này", 403);
  }
  const updateObj = {};
  if (name != null) {
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError("Nếu cập nhật name thì phải là chuỗi không rỗng", 400);
    }
    updateObj.name = name.trim();
  }
  updateObj.price = price;
  updateObj.area = area;

  const updatedRoom = await RoomModel.findByIdAndUpdate(
    roomId,
    { $set: updateObj },
    { new: true, runValidators: true }
  );

  return updatedRoom;
};

exports.delete = async (roomId, ownerId, hostelId) => {
  const existing = await RoomModel.findById(roomId);
  if (!existing) {
    throw new AppError("Không tìm thấy Room", 404);
  }
  if (existing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Bạn không có quyền xóa Hostel này", 403);
  }
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel tương ứng với hostelId", 404);
  }

  await RoomModel.findByIdAndDelete(roomId);

  hostel.emptyRoom = hostel.emptyRoom + 1;
  await hostel.save();
};

exports.getRoomDetail = async (roomId, userId, code) => {
  // 2. Tìm room
  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw new AppError("Không tìm thấy room", 404);
  }
  const hostel = await HostelModel.findById(room.hostelId);
  // 3. Kiểm tra quyền: user phải là owner hoặc nằm trong memberCodes
  const isOwner = room.ownerId.toString() === userId.toString();
  const isMember =
    Array.isArray(hostel.memberCodes) && hostel.memberCodes.includes(code.toString());
  if (!isOwner && !isMember) {
    throw new AppError("Bạn không có quyền xem chi tiết room này", 403);
  }
  return room;
};

exports.addMember = async (hostelId, roomId, name, code, phone, cccdFront, cccdBack) => {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Tên thành viên (name) là bắt buộc và phải là chuỗi không rỗng", 400);
  }

  if (!phone || typeof phone !== "string" || !phone.trim()) {
    throw new AppError("Số điện thoại (phone) là bắt buộc và phải là chuỗi không rỗng", 400);
  }

  let user;
  if (code) {
    user = await User.findOne({ code });
    if (!user) throw new AppError("Mã thành viên không khớp với ai cả", 400);
  }

  // 3. Tìm hostel
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel tương ứng với hostelId", 404);
  }
  if (code && hostel.memberCodes.includes(code)) {
    throw new AppError("Mã thành viên này đã được thêm vào trước đó", 404);
  }
  // 4. Tìm room và đảm bảo room.hostelId khớp với hostelId
  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw new AppError("Không tìm thấy Room tương ứng với roomId", 404);
  }
  if (room.hostelId.toString() !== hostelId.toString()) {
    throw new AppError("Room này không thuộc về Hostel đã chỉ định", 400);
  }
  // 5. Thêm member vào room.members
  const newMember = {
    code: code?.trim() || "",
    name: name.trim(),
    phone: phone.trim(),
    cccdFront: cccdFront || "",
    cccdBack: cccdBack || "",
  };
  room.members = Array.isArray(room.members) ? room.members : [];
  room.members.push(newMember);
  await room.save();

  // 6. Tăng totalMembers của hostel lên 1
  hostel.totalMembers = (hostel.totalMembers || 0) + 1;
  hostel.memberCodes.push(code);
  await hostel.save();

  // 7. Tạo Notification và emit realtime cho user được add (nếu có user)
  if (user) {
    try {
      const notification = await Notification.create({
        receiverId: user._id,
        type: "AM",
        content: `Bạn đã được thêm vào phòng ${room.name}, nhà trọ ${hostel.name}.`,
        isRead: false,
        metadata: {
          hostelId,
          roomId,
          memberName: newMember.name,
        },
      });

      const io = getIO();
      io.to(`user-${user._id.toString()}`).emit("notification", notification);
    } catch (notifErr) {
      console.error("❌ Tạo hoặc gửi Notification thất bại:", notifErr);
    }
  }

  // 8. Trả về room đã cập nhật
  return room;
};

exports.updateMember = async (
  userId,
  { memberId, roomId, hostelId, name, code, phone, cccdFront = "", cccdBack = "" }
) => {
  // Validate IDs
  if (!hostelId) {
    throw new AppError("hostelId không hợp lệ hoặc bị thiếu", 400);
  }
  if (!roomId) {
    throw new AppError("roomId không hợp lệ hoặc bị thiếu", 400);
  }
  if (!memberId) {
    throw new AppError("memberId không hợp lệ hoặc bị thiếu", 400);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Tên thành viên (name) là bắt buộc", 400);
  }

  if (!phone || typeof phone !== "string" || !phone.trim()) {
    throw new AppError("Số điện thoại (phone) là bắt buộc", 400);
  }

  if (code) {
    const user = await User.findOne({ code });
    if (!user) throw new AppError("Mã thành viên không khớp với ai cả", 400);
  }

  // Tìm hostel
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel tương ứng", 404);
  }

  // Tìm room
  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw new AppError("Không tìm thấy Room tương ứng", 404);
  }
  if (room.hostelId.toString() !== hostelId.toString()) {
    throw new AppError("Room này không thuộc về Hostel đã chỉ định", 400);
  }
  if (room.ownerId.toString() !== userId.toString()) throw new AppError("Bạn không có quyền", 403);
  // Tìm member theo oldCode
  const idx = (room.members || []).findIndex((m) => m._id.toString() === memberId.trim());
  if (idx === -1) {
    throw new AppError("Không tìm thấy thành viên với mã đã cho", 404);
  }

  // Cập nhật giá trị
  const oldCode = room.members[idx].code;
  room.members[idx].name = name.trim();
  room.members[idx].phone = phone.trim();
  room.members[idx].code = code.trim();
  room.members[idx].cccdFront = cccdFront;
  room.members[idx].cccdBack = cccdBack;
  // Cập nhật memberCodes trong hostel
  // - Loại bỏ oldCode
  hostel.memberCodes = (hostel.memberCodes || []).filter((c) => c !== oldCode);
  // - Thêm new code
  if (hostel.memberCodes.includes(code)) {
    throw new AppError("Mã thành viên này đã được thêm vào trước đó", 404);
  }
  hostel.memberCodes.push(code.trim());

  await room.save();
  await hostel.save();
  return room;
};

exports.deleteMember = async (userId, { hostelId, roomId, memberId, code }) => {
  // Validate IDs
  if (!hostelId) {
    throw new AppError("hostelId không hợp lệ hoặc bị thiếu", 400);
  }
  if (!roomId) {
    throw new AppError("roomId không hợp lệ hoặc bị thiếu", 400);
  }

  if (!memberId || typeof memberId !== "string" || !memberId.trim()) {
    throw new AppError("memberId là bắt buộc", 400);
  }

  let user;
  if (code) {
    user = await User.findOne({ code });
    if (!user) throw new AppError("Mã thành viên không khớp với ai cả", 400);
  }

  // Tìm hostel
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel tương ứng", 404);
  }

  // Tìm room
  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw new AppError("Không tìm thấy Room tương ứng", 404);
  }
  if (room.hostelId.toString() !== hostelId.toString()) {
    throw new AppError("Room này không thuộc về Hostel đã chỉ định", 400);
  }
  if (room.ownerId.toString() !== userId.toString()) throw new AppError("Bạn không có quyền", 403);

  // Tìm index của member
  const idx = (room.members || []).findIndex((m) => m._id.toString() === memberId.trim());
  if (idx === -1) {
    throw new AppError("Không tìm thấy thành viên với mã đã cho", 404);
  }
  if (room.members[idx].code) {
    hostel.memberCodes = (hostel.memberCodes || []).filter((c) => c !== room.members[idx].code);
  }
  // Xóa khỏi mảng members
  room.members.splice(idx, 1);
  await room.save();

  // Giảm totalMembers của hostel đi 1 (nếu > 0)
  if (hostel.totalMembers > 0) {
    hostel.totalMembers -= 1;
    await hostel.save();
  }

  // 7. Tạo Notification và emit realtime cho user được add (nếu có user)
  if (user) {
    try {
      const notification = await Notification.create({
        receiverId: user._id,
        type: "DM",
        content: `Bạn đã bị xoá khỏi phòng ${room.name}, nhà trọ ${hostel.name}.`,
        isRead: false,
      });

      const io = getIO();
      io.to(`user-${user._id.toString()}`).emit("notification", notification);
    } catch (notifErr) {
      console.error("❌ Tạo hoặc gửi Notification thất bại:", notifErr);
    }
  }

  return room;
};
