const HostelModel = require("../models/Hostel");
const RoomModel = require("../models/Room");
const AppError = require("../utils/AppError");

exports.create = async ({
  ownerId,
  name,
  address,
  floorCount,
  totalRoom,
  emptyRoom,
  services = [],
}) => {
  // 1. Validation các trường bắt buộc
  if (!ownerId) {
    throw new AppError("ownerId là bắt buộc", 400);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Tên nhà trọ (name) là bắt buộc", 400);
  }
  if (!address || typeof address !== "string" || !address.trim()) {
    throw new AppError("Địa chỉ (address) là bắt buộc", 400);
  }
  // 2. Kiểm tra services nếu có phải là mảng hợp lệ
  if (!Array.isArray(services)) {
    throw new AppError("services phải là một mảng", 400);
  }
  services.forEach((s, idx) => {
    if (
      !s ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      typeof s.price !== "number" ||
      s.price < 0 ||
      typeof s.unit !== "string" ||
      !s.unit.trim()
    ) {
      throw new AppError(
        `services[${idx}] không hợp lệ: mỗi phần tử phải có name (String), price (Number ≥ 0), unit (String)`,
        400
      );
    }
  });

  // 4. Tạo mới hostel
  const newHostel = await HostelModel.create({
    ownerId,
    name: name.trim(),
    address: address.trim(),
    floorCount,
    totalRoom,
    emptyRoom,
    services,
  });

  return newHostel;
};

exports.update = async (hostelId, ownerId, { name, address, floorCount, totalRoom, services }) => {
  const existing = await HostelModel.findById(hostelId);
  if (!existing) {
    throw new AppError("Không tìm thấy Hostel", 404);
  }
  // 3. Kiểm tra quyền: chỉ chủ sở hữu mới được update
  if (existing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Bạn không có quyền chỉnh sửa Hostel này", 403);
  }
  // 4. Chuẩn hóa và validate các trường được cung cấp
  const updateObj = {};
  if (name != null) {
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError("Nếu cập nhật name thì phải là chuỗi không rỗng", 400);
    }
    updateObj.name = name.trim();
  }
  if (address != null) {
    if (typeof address !== "string" || !address.trim()) {
      throw new AppError("Nếu cập nhật address thì phải là chuỗi không rỗng", 400);
    }
    updateObj.address = address.trim();
  }
  if (floorCount != null) {
    if (typeof floorCount !== "number" || floorCount < 0) {
      throw new AppError("Nếu cập nhật floorCount thì phải là số ≥ 0", 400);
    }
    updateObj.floorCount = floorCount;
  }
  if (totalRoom != null) {
    if (typeof totalRoom !== "number" || totalRoom < 0) {
      throw new AppError("Nếu cập nhật totalRoom thì phải là số ≥ 0", 400);
    }
    if (existing.emptyRoom - existing.totalRooms + totalRoom < 0) {
      throw new AppError("Tổng số phòng phải lớn hơn số phòng hiện tại", 400);
    }
    updateObj.emptyRoom = existing.emptyRoom - existing.totalRoom + totalRoom;
    updateObj.totalRoom = totalRoom;
  }
  if (services != null) {
    if (!Array.isArray(services)) {
      throw new AppError("Nếu cập nhật services thì phải là một mảng", 400);
    }
    services.forEach((s, idx) => {
      if (
        !s ||
        typeof s.name !== "string" ||
        !s.name.trim() ||
        typeof s.price !== "number" ||
        s.price < 0 ||
        typeof s.unit !== "string" ||
        !s.unit.trim()
      ) {
        throw new AppError(
          `services[${idx}] không hợp lệ: mỗi phần tử phải có name (String), price (Number ≥ 0), unit (String)`,
          400
        );
      }
    });
    updateObj.services = services;
  }

  // 5. Thực hiện cập nhật và trả về document mới
  const updatedHostel = await HostelModel.findByIdAndUpdate(
    hostelId,
    { $set: updateObj },
    { new: true, runValidators: true }
  );

  return updatedHostel;
};

exports.delete = async (hostelId, ownerId) => {
  const existing = await HostelModel.findById(hostelId);
  if (!existing) {
    throw new AppError("Không tìm thấy Hostel", 404);
  }
  // 3. Kiểm tra quyền: chỉ chủ sở hữu mới được xóa
  if (existing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Bạn không có quyền xóa Hostel này", 403);
  }
  // 4. Xóa Hostel
  await HostelModel.findByIdAndDelete(hostelId);
};

exports.getMyHostels = async (userId, code) => {
  if (!userId) {
    throw new AppError("userId không hợp lệ", 400);
  }
  const hostels = await HostelModel.find({
    $or: [{ ownerId: userId }, { memberCodes: code }],
  });
  return hostels;
};

exports.getHostelDetail = async (hostelId, userId, code) => {
  // 2. Tìm hostel
  const hostel = await HostelModel.findById(hostelId);
  if (!hostel) {
    throw new AppError("Không tìm thấy Hostel", 404);
  }

  // 3. Kiểm tra quyền: user phải là owner hoặc nằm trong memberCodes
  const isOwner = hostel.ownerId.toString() === userId.toString();
  const isMember =
    Array.isArray(hostel.memberCodes) && hostel.memberCodes.includes(code.toString());
  if (!isOwner && !isMember) {
    throw new AppError("Bạn không có quyền xem chi tiết Hostel này", 403);
  }
  const rooms = await RoomModel.find({ hostelId }).select(
    "name area price members electricityPrice waterPrice services bills"
  ).lean();
  const roomsWithPermissions = rooms.map((r) => {
    const memberHasCode = Array.isArray(r.members) && r.members.some((m) => m.code === code);
    return {
      ...r,
      canView: isOwner || memberHasCode,
    };
  });
  // 5. Trả về chi tiết phối hợp
  return {
    hostel: {
      _id: hostel._id,
      ownerId: hostel.ownerId,
      name: hostel.name,
      address: hostel.address,
      managerName: hostel.managerName,
      managerPhone: hostel.managerPhone,
      totalRooms: hostel.totalRooms,
      totalMembers: hostel.totalMembers,
      services: hostel.services,
      memberCodes: hostel.memberCodes,
      createdAt: hostel.createdAt,
      updatedAt: hostel.updatedAt,
    },
    rooms: roomsWithPermissions, // mảng Room
  };
};
