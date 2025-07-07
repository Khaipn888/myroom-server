const User = require("../models/User");
const Post = require("../models/Post");
const AppError = require("../utils/AppError");
const elasticClient = require("../utils/elasticsearchClient");
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
