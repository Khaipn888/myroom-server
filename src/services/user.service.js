const User = require("../models/User");
const Post = require("../models/Post");
const AppError = require("../utils/AppError");
const elasticClient = require("../utils/elasticsearchClient");
const HostelModel = require("../models/Hostel");
const RoomModel = require("../models/Room");
const Notification = require("../models/Notification");
const InvoiceModel = require("../models/Invoice");
const { getIO } = require("../socket/socket");
/**
 * Lưu bài đăng vào danh sách đã lưu của người dùng
 */
exports.savePost = async (userId, postId) => {
  if (!postId) throw new AppError("Thiếu postId", 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);

  const alreadySaved = user.savedPosts?.some((id) => id.toString() === postId);

  if (alreadySaved) {
    throw new AppError("Tin này đã được lưu trước đó", 400);
  }

  user.savedPosts.push(postId);
  await user.save();

  return { savedPosts: user.savedPosts };
};

/**
 * Xóa bài đăng khỏi danh sách đã lưu
 */
exports.unsavePost = async (userId, postId) => {
  if (!postId) throw new AppError("Thiếu postId", 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);

  user.savedPosts = user.savedPosts.filter((id) => id.toString() !== postId);
  await user.save();

  return { savedPosts: user.savedPosts };
};

/**
 * Lấy toàn bộ danh sách bài đăng đã lưu (có populate)
 */
exports.getMySavedPosts = async (
  userId,
  { type = [], keyword = "", page = 1, limit = 10, sort = "createdAt:desc" } = {}
) => {
  if (!userId) throw new AppError("Thiếu userId", 400);

  // 1) Lấy danh sách ID đã lưu
  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);
  const savedIds = user.savedPosts.map((id) => id.toString());
  if (!savedIds.length) {
    return {
      posts: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    };
  }
  // 2) Xây dựng ES query
  const must = [{ terms: { _id: savedIds } }];
  if (typeof type === "string") {
    const trimmedType = type.trim();
    if (trimmedType === "") {
      type = [];
    } else {
      type = trimmedType.includes(",")
        ? trimmedType.split(",").map((s) => s.trim())
        : [trimmedType];
    }
  }

  if (Array.isArray(type) && type.length > 0) {
    must.push({ terms: { type: type } });
  }
  if (keyword) {
    must.push({
      multi_match: {
        query: keyword,
        fields: ["title^2", "address"],
        type: "best_fields",
        fuzziness: "AUTO",
        operator: "and",
      },
    });
  }

  // === 2. Parse sortParam ===
  const [sortField, sortOrderRaw] = sort.split(":");
  const sortOrder = ["asc", "desc"].includes(sortOrderRaw) ? sortOrderRaw : "desc";

  // === 3. Gọi Elasticsearch search ===
  const res = await elasticClient.search({
    index: "posts",
    from: (page - 1) * limit,
    size: limit,
    body: {
      query: { bool: { must } },
      sort: [{ [sortField]: { order: sortOrder } }],
    },
  });

  // --- 3.1. Lấy tổng số kết quả ---
  const totalHits = typeof res.hits.total === "object" ? res.hits.total.value : res.hits.total;

  // Nếu không có kết quả, trả về mảng rỗng + pagination
  if (totalHits === 0) {
    return {
      posts: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    };
  }

  // === 4. Lấy danh sách ID từ Elasticsearch hit ===
  const hitIds = res.hits.hits.map((hit) => hit._id);

  // === 5. Query MongoDB để lấy thêm các trường mong muốn ===
  //    Lấy các trường: contactName, contactPhone, contactZalo, media, location, userId
  //    Có thể mở rộng thêm nếu bạn cần thêm utilities, description, v.v.
  const postsFromDb = await Post.find(
    { _id: { $in: hitIds } },
    {
      contactName: 1,
      contactPhone: 1,
      contactZalo: 1,
      media: 1,
      location: 1,
      userId: 1,
      // Nếu bạn muốn thêm trường khác từ Mongo, ví dụ:
      // utilities: 1,
      // description: 1,
      // area: 1,
      // price: 1,
    }
  )
    .populate("userId", "name avatar phoneNumber")
    .lean();

  // === 6. Chuyển postsFromDb thành một map để lookup nhanh theo _id ===
  //    Ví dụ: dbMap["60f6e8c2a1234f0012345678"] = { contactName: "...", ... }
  const dbMap = {};
  postsFromDb.forEach((doc) => {
    dbMap[doc._id.toString()] = doc;
  });

  // === 7. Merge kết quả: mỗi hit từ ES nối thêm các trường từ MongoDB ===
  const mergedPosts = res.hits.hits.map((hit) => {
    const source = hit._source || {}; // tất cả fields từ Elasticsearch _source
    const id = hit._id;
    const fromDb = dbMap[id] || {};

    return {
      id: id,
      ...source,
      contactName: fromDb.contactName,
      contactPhone: fromDb.contactPhone,
      contactZalo: fromDb.contactZalo,
      media: fromDb.media,
      location: fromDb.location,
      userId: fromDb.userId,
    };
  });

  // === 8. Trả về kết quả cuối cùng ===
  return {
    posts: mergedPosts,
    pagination: {
      total: totalHits,
      page,
      limit,
      totalPages: Math.ceil(totalHits / limit),
    },
  };
};

exports.getAllMyPosts = async (
  userId,
  { status = [], keyword = "", type = [], page = 1, limit = 10, sort = "createdAt:desc" } = {}
) => {
  if (!userId) throw new AppError("Thiếu userId", 400);

  // === 1. Build phần must-clause cho Elasticsearch ===
  const must = [{ term: { userId: userId.toString() } }];

  if (typeof status === "string") {
    const trimmed = status.trim();
    if (trimmed === "") {
      status = [];
    } else {
      // Nếu client truyền "actived,reject" thì split thành ["actived","reject"]
      status = trimmed.includes(",") ? trimmed.split(",").map((s) => s.trim()) : [trimmed];
    }
  }

  if (typeof type === "string") {
    const trimmedType = type.trim();
    if (trimmedType === "") {
      type = [];
    } else {
      type = trimmedType.includes(",")
        ? trimmedType.split(",").map((s) => s.trim())
        : [trimmedType];
    }
  }

  if (Array.isArray(status) && status.length > 0) {
    must.push({ terms: { status: status } });
  }
  if (Array.isArray(type) && type.length > 0) {
    must.push({ terms: { type: type } });
  }
  if (keyword) {
    must.push({
      multi_match: {
        query: keyword,
        fields: ["title^2", "address"],
        type: "best_fields",
        fuzziness: "AUTO",
        operator: "and",
      },
    });
  }

  // === 2. Parse sortParam ===
  const [sortField, sortOrderRaw] = sort.split(":");
  const sortOrder = ["asc", "desc"].includes(sortOrderRaw) ? sortOrderRaw : "desc";

  // === 3. Gọi Elasticsearch search ===
  const res = await elasticClient.search({
    index: "posts",
    from: (page - 1) * limit,
    size: limit,
    body: {
      query: { bool: { must } },
      sort: [{ [sortField]: { order: sortOrder } }],
    },
  });

  // --- 3.1. Lấy tổng số kết quả ---
  const totalHits = typeof res.hits.total === "object" ? res.hits.total.value : res.hits.total;

  // Nếu không có kết quả, trả về mảng rỗng + pagination
  if (totalHits === 0) {
    return {
      posts: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    };
  }

  // === 4. Lấy danh sách ID từ Elasticsearch hit ===
  const hitIds = res.hits.hits.map((hit) => hit._id);

  // === 5. Query MongoDB để lấy thêm các trường mong muốn ===
  //    Lấy các trường: contactName, contactPhone, contactZalo, media, location, userId
  const postsFromDb = await Post.find(
    { _id: { $in: hitIds } },
    {
      contactName: 1,
      contactPhone: 1,
      contactZalo: 1,
      media: 1,
      location: 1,
      userId: 1,
      // Nếu bạn muốn thêm trường khác từ Mongo, ví dụ:
      // utilities: 1,
      // description: 1,
      // area: 1,
      // price: 1,
    }
  )
    .populate("userId", "name avatar phoneNumber")
    .lean();

  // === 6. Chuyển postsFromDb thành một map để lookup nhanh theo _id ===
  //    Ví dụ: dbMap["60f6e8c2a1234f0012345678"] = { contactName: "...", ... }
  const dbMap = {};
  postsFromDb.forEach((doc) => {
    dbMap[doc._id.toString()] = doc;
  });

  // === 7. Merge kết quả: mỗi hit từ ES nối thêm các trường từ MongoDB ===
  const mergedPosts = res.hits.hits.map((hit) => {
    const source = hit._source || {}; // tất cả fields từ Elasticsearch _source
    const id = hit._id;
    const fromDb = dbMap[id] || {};

    return {
      id: id,
      ...source,
      contactName: fromDb.contactName,
      contactPhone: fromDb.contactPhone,
      contactZalo: fromDb.contactZalo,
      media: fromDb.media,
      location: fromDb.location,
      userId: fromDb.userId,
    };
  });

  // === 8. Trả về kết quả cuối cùng ===
  return {
    posts: mergedPosts,
    pagination: {
      total: totalHits,
      page,
      limit,
      totalPages: Math.ceil(totalHits / limit),
    },
  };
};

exports.getMyPostSearchSuggestions = async ({ userId, q }) => {
  if (!userId) throw new AppError("Thiếu userId", 400);
  if (!q) return [];

  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);

  const body = {
    query: {
      bool: {
        must: [{ term: { userId: userId.toString() } }],
        // Kết hợp fuzzy match và phrase_prefix
        should: [
          {
            // 1) Fuzzy trên từng từ (best_fields)
            multi_match: {
              query: q,
              fields: ["title^2", "address"],
              type: "best_fields",
              operator: "and",
              fuzziness: "AUTO",
              max_expansions: 50,
            },
          },
          {
            // 2) Prefix search nguyên chuỗi (không dùng fuzziness)
            multi_match: {
              query: q,
              fields: ["title^2", "address"],
              type: "phrase_prefix",
              max_expansions: 50,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["title", "address"],
  };

  const res = await elasticClient.search({
    index: "posts",
    size: 10,
    body,
  });

  const seen = new Set();
  const suggestions = [];

  for (const hit of res.hits.hits) {
    const val = hit._source.title || hit._source.address;
    if (!seen.has(val)) {
      seen.add(val);
      suggestions.push({ label: val, value: val });
    }
  }

  return suggestions;
};

exports.updateMe = async (userId, payload) => {
  if (!userId) throw new AppError("Thiếu userId", 400);

  // Tìm user theo ID
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  // payload có thể chứa: name, phone, email, address, gender, avatar, …
  const { name, phone, email, address, gender, avatar } = payload;

  // Cập nhật từng field nếu có trong payload
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (email !== undefined) user.email = email;
  if (address !== undefined) user.address = address;
  if (gender !== undefined) user.gender = gender;
  if (avatar !== undefined) user.avatar = avatar;

  // Lưu lại vào database
  const updated = await user.save();
  return updated;
};

exports.getAllPostsByAdmin = async ({
  status = [],
  keyword = "",
  type = [],
  page = 1,
  limit = 10,
  sort = "createdAt:desc",
} = {}) => {
  // Build phần must-clause cho Elasticsearch ===
  const must = [];
  const must_not = [{ term: { status: "draft" } }];
  if (typeof status === "string") {
    const trimmed = status.trim();
    if (trimmed === "") {
      status = [];
    } else {
      // Nếu client truyền "actived,reject" thì split thành ["actived","reject"]
      status = trimmed.includes(",") ? trimmed.split(",").map((s) => s.trim()) : [trimmed];
    }
  }

  if (typeof type === "string") {
    const trimmedType = type.trim();
    if (trimmedType === "") {
      type = [];
    } else {
      type = trimmedType.includes(",")
        ? trimmedType.split(",").map((s) => s.trim())
        : [trimmedType];
    }
  }

  if (Array.isArray(status) && status.length > 0) {
    must.push({ terms: { status: status } });
  }
  if (Array.isArray(type) && type.length > 0) {
    must.push({ terms: { type: type } });
  }
  if (keyword) {
    must.push({
      multi_match: {
        query: keyword,
        fields: ["title^2", "address"],
        type: "best_fields",
        fuzziness: "AUTO",
        operator: "and",
      },
    });
  }

  // === 2. Parse sortParam ===
  const [sortField, sortOrderRaw] = sort.split(":");
  const sortOrder = ["asc", "desc"].includes(sortOrderRaw) ? sortOrderRaw : "desc";

  // === 3. Gọi Elasticsearch search ===
  const res = await elasticClient.search({
    index: "posts",
    from: (page - 1) * limit,
    size: limit,
    body: {
      query: { bool: { must, must_not } },
      sort: [{ [sortField]: { order: sortOrder } }],
    },
  });

  // --- 3.1. Lấy tổng số kết quả ---
  const totalHits = typeof res.hits.total === "object" ? res.hits.total.value : res.hits.total;

  // Nếu không có kết quả, trả về mảng rỗng + pagination
  if (totalHits === 0) {
    return {
      posts: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    };
  }

  // 4. Lấy danh sách ID từ Elasticsearch hit
  const hitIds = res.hits.hits.map((hit) => hit._id);

  // 5. Query MongoDB để lấy thêm các trường mong muốn
  const postsFromDb = await Post.find(
    { _id: { $in: hitIds } },
    {
      contactName: 1,
      contactPhone: 1,
      contactZalo: 1,
      media: 1,
      location: 1,
      userId: 1,
      reports: 1,
      // Nếu bạn muốn thêm trường khác từ Mongo, ví dụ:
      // utilities: 1,
      // description: 1,
      // area: 1,
      // price: 1,
    }
  )
    .populate("userId", "name avatar phoneNumber")
    .lean();

  // === 6. Chuyển postsFromDb thành một map để lookup nhanh theo _id ===
  const dbMap = {};
  postsFromDb.forEach((doc) => {
    dbMap[doc._id.toString()] = doc;
  });

  // === 7. Merge kết quả: mỗi hit từ ES nối thêm các trường từ MongoDB ===
  const mergedPosts = res.hits.hits.map((hit) => {
    const source = hit._source || {}; // tất cả fields từ Elasticsearch _source
    const id = hit._id;
    const fromDb = dbMap[id] || {};

    return {
      id: id,
      ...source,
      contactName: fromDb.contactName,
      contactPhone: fromDb.contactPhone,
      contactZalo: fromDb.contactZalo,
      media: fromDb.media,
      location: fromDb.location,
      userId: fromDb.userId,
    };
  });

  // === 8. Trả về kết quả cuối cùng ===
  return {
    posts: mergedPosts,
    pagination: {
      total: totalHits,
      page,
      limit,
      totalPages: Math.ceil(totalHits / limit),
    },
  };
};

exports.getPostSearchSuggestionsForAdmin = async ({ q }) => {
  if (!q) return [];
  const body = {
    query: {
      bool: {
        must: [],
        // Kết hợp fuzzy match và phrase_prefix
        should: [
          {
            // 1) Fuzzy trên từng từ (best_fields)
            multi_match: {
              query: q,
              fields: ["title^2", "address"],
              type: "best_fields",
              operator: "and",
              fuzziness: "AUTO",
              max_expansions: 50,
            },
          },
          {
            // 2) Prefix search nguyên chuỗi (không dùng fuzziness)
            multi_match: {
              query: q,
              fields: ["title^2", "address"],
              type: "phrase_prefix",
              max_expansions: 50,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["title", "address"],
  };

  const res = await elasticClient.search({
    index: "posts",
    size: 10,
    body,
  });

  const seen = new Set();
  const suggestions = [];

  for (const hit of res.hits.hits) {
    const val = hit._source.title || hit._source.address;
    if (!seen.has(val)) {
      seen.add(val);
      suggestions.push({ label: val, value: val });
    }
  }

  return suggestions;
};

exports.getAllUsersByAdmin = async ({
  status = [],
  roles = [],
  keyword = "",
  page = 1,
  limit = 10,
  sort = "createdAt:desc",
}) => {
  const query = {};

  // Lọc theo trạng thái (status)
  if (Array.isArray(status) && status.length > 0) {
    query.status = { $in: status };
  }

  // Lọc theo loại (type)
  if (Array.isArray(roles) && roles.length > 0) {
    query.role = { $in: roles };
  }
  if (typeof status === "string") {
    const trimmed = status.trim();
    if (trimmed === "") {
      status = [];
    } else {
      status = trimmed.includes(",") ? trimmed.split(",").map((s) => s.trim()) : [trimmed];
    }
    query.status = { $in: status };
  }

  if (typeof roles === "string") {
    const trimmedRole = roles.trim();
    if (trimmedRole === "") {
      roles = [];
    } else {
      roles = trimmedRole.includes(",")
        ? trimmedRole.split(",").map((s) => s.trim())
        : [trimmedRole];
    }
    query.role = { $in: roles };
  }
  // Tìm kiếm theo keyword (có thể search name, email, phone)
  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { email: { $regex: keyword, $options: "i" } },
      { phone: { $regex: keyword, $options: "i" } },
    ];
  }

  let sortObj = { createdAt: -1 };
  if (sort && sort.includes(":")) {
    const [field, order] = sort.split(":");
    sortObj = { [field]: order === "desc" ? -1 : 1 };
  }

  // Phân trang
  const skip = (page - 1) * limit;

  // Truy vấn DB
  const [users, total] = await Promise.all([
    User.find(query).sort(sortObj).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

exports.suggestUserByKeyword = async (keyword) => {
  const query = {
    $or: [
      { name: { $regex: keyword, $options: "i" } },
      { email: { $regex: keyword, $options: "i" } },
      { phone: { $regex: keyword, $options: "i" } },
    ],
  };
  // Giới hạn 10 kết quả, chỉ lấy trường cần thiết
  const users = await User.find(query).limit(10).select("name email phone avatar _id");

  // Có thể return gọn để UI dễ dùng
  return users.map((u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatar: u.avatar,
  }));
};

exports.setUserStatus = async (userId, status, reason = "") => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);

  user.status = status;
  if (status !== "actived") user.reason = reason;
  await user.save();

  return {
    id: user._id,
    status: user.status,
    name: user.name,
    email: user.email,
  };
};

exports.leaveRoom = async (userId, { hostelId, roomId, memberId, code }) => {
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
  if (user._id.toString() !== userId.toString()) throw new AppError("Bạn không có quyền", 403);

  // Tìm index của member
  const idx = (room.members || []).findIndex((m) => m._id.toString() === memberId.trim());
  if (idx === -1) {
    throw new AppError("Không tìm thấy thành viên với mã đã cho", 404);
  }
  const memberName = room.members[idx].name;
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

  const owner = await User.findById(room.ownerId);

  if (owner) {
    try {
      const notification = await Notification.create({
        receiverId: room.ownerId,
        type: "UL",
        content: `${memberName} đã rời khỏi phòng ${room.name}, nhà trọ ${hostel.name}.`,
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

exports.sendNoti = async (userId, hostelId, type, content, month, year) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("Không tìm thấy người dùng", 404);

  // Lấy tất cả phòng mà user là chủ
  const rooms = await RoomModel.find({ hostelId, ownerId: userId }).lean();
  if (!rooms || rooms.length === 0) return { countMember: 0 };

  let memberCodes = [];

  // Chốt số điện nước: gửi nếu phòng chưa có hóa đơn tháng này
  if (type === "electric") {
    for (let i = 0; i < rooms.length; i++) {
      const roomId = rooms[i]._id;
      const invoice = await InvoiceModel.findOne({ roomId, hostelId, year, month });
      if (!invoice && Array.isArray(rooms[i].members)) {
        memberCodes = memberCodes.concat(rooms[i].members.map((m) => m.code));
      }
    }
  }
  // Nộp tiền phòng: gửi nếu hóa đơn trạng thái chưa thanh toán
  if (type === "rent") {
    for (let i = 0; i < rooms.length; i++) {
      const roomId = rooms[i]._id;
      const invoice = await InvoiceModel.findOne({ roomId, hostelId, year, month });
      if (invoice && invoice.paymentStatus === "not-pay") {
        memberCodes = memberCodes.concat(rooms[i].members.map((m) => m.code));
      }
    }
  }
  // Xoá trùng memberCode
  memberCodes = [...new Set(memberCodes)];

  // Lấy danh sách user nhận thông báo từ memberCode
  const members = await User.find({ code: { $in: memberCodes } });
  if (!members.length) return { countMember: 0 };

  const io = getIO();

  // Gửi noti + socket từng user
  let count = 0;
  for (const mem of members) {
    try {
      const notification = await Notification.create({
        receiverId: mem._id,
        type: "IF",
        content: `Thông báo từ chủ trọ: ${content}`,
        isRead: false,
        metadata: {
          hostelId,
        },
      });
      io.to(`user-${mem._id.toString()}`).emit("notification", notification);
      count++;
    } catch (notifErr) {
      console.error("❌ Tạo hoặc gửi Notification thất bại:", notifErr);
    }
  }

  return {
    countMember: count,
  };
};
