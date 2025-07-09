const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket/socket");
const AppError = require("../utils/AppError");
const elasticClient = require("../utils/elasticsearchClient");

exports.create = async (data) => {
  const post = new Post(data);
  const saved = await post.save();

  // Đồng bộ sang Elasticsearch
  try {
    await elasticClient.index({
      index: "posts",
      id: saved._id.toString(),
      document: {
        userId: saved.userId.toString(),
        title: saved.title,
        description: saved.description,
        address: saved.address,
        price: saved.price,
        area: saved.area,
        type: saved.type,
        createdAt: saved.createdAt,
        utilities: saved.utilities,
        peoplePerRoom: saved.peoplePerRoom,
        services: saved.services,
        status: saved.status,
      },
    });
  } catch (err) {
    console.error("❌ Elasticsearch sync failed:", err);
    // Không throw để không ảnh hưởng đến API
  }

  try {
    const admin = await User.find({ role: "admin" });
    const notification = await Notification.create({
      receiverId: admin._id,
      type: "CP",
      content: `Có yêu cầu duyệt tin mới: ${saved.title}`,
      isRead: false,
      metadata: { postId: saved._id },
    });

    const io = getIO();
    io.to("admins").emit("notification", notification);
  } catch (err) {
    console.error("❌ Tạo hoặc gửi Notification thất bại:", err);
  }
  return saved;
};

exports.update = async (userId, id, data) => {
  // 1. Cập nhật document trong MongoDB
  const updated = await Post.findByIdAndUpdate(
    id,
    { ...data, status: "pending" },
    {
      new: true, // trả về document sau khi cập nhật
      runValidators: true, // chạy schema validation
    }
  );
  if (!updated || updated.userId.toString() !== userId) {
    throw new AppError(404, "Post not found");
  }
  // 2. Đồng bộ lên Elasticsearch (chỉ cập nhật các trường thay đổi)
  try {
    await elasticClient.update({
      index: "posts",
      id: updated._id.toString(),
      doc: {
        userId: updated.userId.toString(),
        title: updated.title,
        description: updated.description,
        address: updated.address,
        price: updated.price,
        area: updated.area,
        type: updated.type,
        createdAt: updated.createdAt,
        utilities: updated.utilities,
        peoplePerRoom: updated.peoplePerRoom,
        services: updated.services,
        status: updated.status,
      },
      retry_on_conflict: 3, // tranh xung đột version
    });
  } catch (err) {
    console.error("❌ Elasticsearch sync failed:", err);
    // Không throw để không block API
  }

  try {
    const admin = await User.find({ role: "admin" });
    const notification = await Notification.create({
      receiverId: admin._id,
      type: "UD",
      content: `Tin đã được sửa lại: ${updated.title}`,
      isRead: false,
      metadata: { postId: updated._id },
    });

    const io = getIO();
    io.to("admins").emit("notification", notification);
  } catch (err) {
    console.error("❌ Tạo hoặc gửi Notification thất bại:", err);
  }

  return updated;
};

exports.searchPostsES = async (query) => {
  // Hàm buildQuery sẽ nhận thêm một đối tượng 'options' chứa các cờ
  // để quyết định giữ/bỏ từng phần filter. Đồng thời trả về cả một mảng
  // key tương ứng với các filter đang áp dụng.
  const buildQuery = (options) => {
    const must = [];
    const filter = [{ term: { status: "actived" } }];

    // Mảng để track tên các filter đã được thêm
    const applied = [];

    // 0. Province (nếu khác "Toàn quốc") luôn được giữ
    if (query.province && query.province !== "Toàn quốc") {
      filter.push({
        match_phrase: { address: query.province.trim() },
      });
      applied.push("province");
    }

    // 1. Keyword (nếu keepKeyword = true và query.keyword có giá trị)
    if (options.keepKeyword && query.keyword) {
      must.push({
        multi_match: {
          query: query.keyword.trim(),
          fields: ["title", "address"],
          type: "best_fields",
          operator: "or",
          minimum_should_match: "2",
        },
      });
      applied.push("keyword");
    }

    // 2. postType (nếu có) -- luôn giữ trong tất cả các bước
    if (query.postType) {
      filter.push({ term: { type: query.postType } });
      applied.push("postType");
    }

    // 3. peoplePerRoom (nếu keepPeople = true và query.peoplePerRoom có giá trị)
    if (options.keepPeople && query.peoplePerRoom) {
      filter.push({ term: { peoplePerRoom: query.peoplePerRoom } });
      applied.push("peoplePerRoom");
    }

    // 4. utilities (nếu keepUtilities = true và query.utilities có giá trị)
    if (options.keepUtilities && query.utilities) {
      const utils = Array.isArray(query.utilities) ? query.utilities : [query.utilities];
      utils.forEach((u) => filter.push({ term: { utilities: u } }));
      applied.push("utilities");
    }

    // 5. Price range (nếu keepPrice = true và có priceMin/priceMax)
    if (options.keepPrice && (query.priceMin || query.priceMax)) {
      filter.push({
        range: {
          price: {
            gte: query.priceMin || 0,
            lte: query.priceMax || 1e9,
          },
        },
      });
      applied.push("price");
    }

    // 6. Area range (nếu keepArea = true và có areaMin/areaMax)
    if (options.keepArea && (query.areaMin || query.areaMax)) {
      filter.push({
        range: {
          area: {
            gte: query.areaMin || 0,
            lte: query.areaMax || 1e9,
          },
        },
      });
      applied.push("area");
    }

    return { must, filter, applied };
  };

  // Parse page/limit/sort như trước
  const page = parseInt(query.page || 1);
  const limit = parseInt(query.limit || 10);
  const sort = (query.sort === "price_asc" && [{ price: "asc" }]) ||
    (query.sort === "price_desc" && [{ price: "desc" }]) || [{ createdAt: "desc" }];

  // Định nghĩa các bước nới lỏng
  const relaxationSteps = [
    // Bước 0: Strict - giữ nguyên tất cả điều kiện
    {
      keepKeyword: true,
      keepPeople: true,
      keepUtilities: true,
      keepPrice: true,
      keepArea: true,
    },
    // Bước 1: Bỏ peoplePerRoom & utilities, giữ keyword, price, area
    {
      keepKeyword: true,
      keepPeople: false,
      keepUtilities: false,
      keepPrice: true,
      keepArea: true,
    },
    // Bước 2: Bỏ thêm area, giữ keyword, price
    {
      keepKeyword: true,
      keepPeople: false,
      keepUtilities: false,
      keepPrice: true,
      keepArea: false,
    },
    // Bước 3: Bỏ price, giữ keyword
    {
      keepKeyword: true,
      keepPeople: false,
      keepUtilities: false,
      keepPrice: false,
      keepArea: false,
    },
    // Bước 4: Bỏ keyword, chỉ giữ postType + province (và status)
    {
      keepKeyword: false,
      keepPeople: false,
      keepUtilities: false,
      keepPrice: false,
      keepArea: false,
    },
  ];

  // Hàm hỗ trợ thực hiện ES search và merge với MongoDB,
  // đồng thời trả về totalHits và posts (mảng bài đăng)
  async function doSearchAndMerge(esQueryObject) {
    const res = await elasticClient.search({
      index: "posts",
      from: (page - 1) * limit,
      size: limit,
      sort,
      query: {
        bool: {
          must: esQueryObject.must,
          filter: esQueryObject.filter,
        },
      },
    });

    const totalHits = res.hits.total.value;
    if (totalHits === 0) {
      return { totalHits, posts: [] };
    }

    const ids = res.hits.hits.map((hit) => hit._id);

    const postsFromDb = await Post.find(
      { _id: { $in: ids } },
      {
        contactName: 1,
        contactPhone: 1,
        contactZalo: 1,
        media: 1,
        location: 1,
        userId: 1,
      }
    )
      .populate("userId", "name avatar phoneNumber")
      .lean();

    const dbMap = new Map(postsFromDb.map((p) => [p._id.toString(), p]));

    const posts = res.hits.hits.map((hit) => {
      const { status: _st, ...esDocWithoutStatus } = hit._source;
      const extra = dbMap.get(hit._id.toString()) || {};
      return {
        id: hit._id,
        ...esDocWithoutStatus,
        ...extra,
      };
    });

    return { totalHits, posts };
  }

  // Bắt đầu vòng lặp qua từng bước relaxation
  for (let step = 0; step < relaxationSteps.length; step++) {
    const options = relaxationSteps[step];

    // buildQuery trả về { must, filter, applied }
    const { must, filter, applied } = buildQuery(options);
    const { totalHits, posts } = await doSearchAndMerge({ must, filter });

    if (totalHits > 0) {
      const center = computeCenter(posts);
      return {
        total: totalHits,
        posts,
        suggested: step !== 0,
        center,
        appliedFilters: applied, // Trả thêm mảng các filter còn đang áp dụng
      };
    }
    // Nếu totalHits === 0, chuyển sang bước tiếp theo
  }

  // Nếu không có kết quả dù đã nới lỏng hết
  return {
    total: 0,
    posts: [],
    suggested: true,
    center: null,
    appliedFilters: ["province"], // Chỉ còn province (nếu tính province luôn áp dụng); hoặc giữ rỗng tùy ý
  };
};

// Một hàm phụ để tính center từ mảng posts:
const computeCenter = (postsArray) => {
  if (!postsArray || postsArray.length === 0) {
    // Trả về null hoặc center mặc định (ví dụ Hà Nội)
    return null;
  }
  let minLng = postsArray[0].location.lng;
  let maxLng = postsArray[0].location.lng;
  let minLat = postsArray[0].location.lat;
  let maxLat = postsArray[0].location.lat;

  postsArray.forEach((p) => {
    const { lng, lat } = p.location;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  return [centerLng, centerLat];
};

exports.getSearchSuggestions = async ({ q, province }) => {
  if (!q) return [];

  // Build phần must + should
  const must = [{ term: { status: "actived" } }];
  if (province !== "Toàn quốc") {
    must.push({
      match_phrase: {
        address: { query: province },
      },
    });
  }

  const body = {
    query: {
      bool: {
        must,
        should: [
          {
            multi_match: {
              query: q,
              fields: ["address^2", "title"],
              type: "best_fields",
              operator: "and",
              max_expansions: 50,
            },
          },
          {
            multi_match: {
              query: q,
              fields: ["address^2", "title"],
              type: "phrase_prefix",
              max_expansions: 50,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["address", "title"],
  };

  const res = await elasticClient.search({
    index: "posts",
    size: 20,
    body,
  });

  // Hàm normalize: bỏ dấu, xóa ký tự đặc biệt, lowercase
  function normalize(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .toLowerCase()
      .trim();
  }

  const seen = new Set();
  const suggestions = [];

  for (const hit of res.hits.hits) {
    const rawAddress = hit._source.address || "";
    const rawTitle = hit._source.title || "";

    // Nếu đã thêm cùng một title rồi, bỏ qua
    if (rawTitle && seen.has(rawTitle)) continue;
    // Nếu title rỗng và đã thêm cùng một address rồi, bỏ qua
    if (!rawTitle && seen.has(rawAddress)) continue;

    const addressNorm = normalize(rawAddress); // e.g. "ha noi hoang mai"
    const titleNorm = normalize(rawTitle); // e.g. "cho thue nha tai ha noi"
    const qNorm = normalize(q); // e.g. "ha noi"

    let snippet = "";
    let usedKey = "";

    // 1) Nếu address chứa qNorm, ưu tiên trả address
    if (addressNorm.includes(qNorm)) {
      snippet = rawAddress;
      usedKey = rawAddress;
    }
    // 2) Nếu không, mà title chứa qNorm, trả title
    else if (titleNorm.includes(qNorm)) {
      snippet = rawTitle;
      usedKey = rawTitle;
    }
    // 3) Fallback: trả title nếu có, hoặc address
    else {
      if (rawTitle) {
        snippet = rawTitle;
        usedKey = rawTitle;
      } else {
        snippet = rawAddress;
        usedKey = rawAddress;
      }
    }

    if (!seen.has(usedKey)) {
      seen.add(usedKey);
      suggestions.push({ label: snippet, value: snippet });
    }
  }

  return suggestions;
};

exports.getDetailPost = async (postId) => {
  // 1. Lấy post từ MongoDB
  const post = await Post.findById(postId)
    .populate("userId", "name avatar email savedPosts")
    .lean();

  if (!post) {
    return null;
  }

  // 2. Xử lý thông tin user từ populate
  let user = null;
  if (post.userId) {
    const u = post.userId;
    user = {
      id: u._id.toString(),
      name: u.name,
      avatar: u.avatar,
      email: u.email,
      numberOfPost: u.numberOfPost
    };
  }

  // 3. Build object trả về
  const detail = {
    id: postId,
    title: post.title,
    description: post.description,
    address: post.address,
    price: post.price,
    area: post.area,
    utilities: post.utilities,
    services: post.services,
    media: post.media,
    location: post.location,
    contactName: post.contactName,
    contactPhone: post.contactPhone,
    contactZalo: post.contactZalo,
    createdAt: post.createdAt?.toString(),
    user,
  };

  return detail;
};

exports.getMyDetailPost = async (userId, postId) => {
  // 1. Lấy post từ MongoDB
  const post = await Post.findById(postId).lean();

  if (!post) {
    throw new AppError("Không tìm thấy bài đăng tương ứng", 404);
  }
  if (post.userId.toString() !== userId) {
    throw new AppError("Bài đăng không tồn tại", 404);
  }
  // 3. Build object trả về
  const detail = {
    id: postId,
    type: post.type,
    title: post.title,
    description: post.description,
    address: post.address,
    price: post.price,
    area: post.area,
    utilities: post.utilities,
    services: post.services,
    media: post.media,
    peoplePerRoom: post.peoplePerRoom,
    location: post.location,
    contactName: post.contactName,
    contactPhone: post.contactPhone,
    contactZalo: post.contactZalo,
    createdAt: post.createdAt?.toString(),
  };

  return detail;
};

exports.getSimilarPosts = async (postId, size = 5) => {
  // 1. Lấy bài đăng hiện tại từ Mongo
  const post = await Post.findById(postId).lean();
  if (!post) {
    // Nếu không tìm thấy, trả về mảng rỗng
    return [];
  }

  // 2. Chuẩn bị các trường cần thiết để build ES query
  const {
    title,
    description,
    address,
    price,
    area,
    type,
    utilities = [],
    location,
    // ... các trường khác nếu cần
  } = post;

  // Phân tích province từ address (giả sử address chứa tỉnh/thành);
  // nếu bạn có trường province riêng, dùng luôn post.province
  const province = post.province || address;
  const phrases = province
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const shouldClauses = phrases.map((word) => ({
    match: { address: word },
  }));
  // Tính khoảng giá ±500000 và khoảng diện tích ±10m2
  const priceLower = price - 1000000;
  const priceUpper = price + 1000000;
  const areaLower = area - 10;
  const areaUpper = area + 10;

  // 3. Xây truy vấn Elasticsearch
  const esQuery = {
    index: "posts",
    size,
    query: {
      bool: {
        must: [
          {
            more_like_this: {
              fields: ["title"],
              like: [
                {
                  _id: postId, // tìm dựa vào ES doc gốc
                  _index: "posts",
                },
              ],
              min_term_freq: 1,
              min_doc_freq: 1,
            },
          },
        ],
        filter: [
          ...(type ? [{ term: { type: type } }] : []),
          {
            range: {
              price: {
                gte: priceLower,
                lte: priceUpper,
              },
            },
          },
          // --- Lọc area trong khoảng ±20% ---
          {
            range: {
              area: {
                gte: areaLower,
                lte: areaUpper,
              },
            },
          },
          // --- Lọc có ít nhất 1 tiện ích cùng loại ---
          {
            bool: {
              must_not: [
                {
                  term: { _id: postId },
                },
              ],
            },
          },
          // --- Chỉ lấy bài đăng đang active (nếu ES index có field status) ---
          { term: { status: "actived" } },
        ],
        should: shouldClauses,
        minimum_should_match: 3,
      },
    },
    sort: [
      // Combo giữa _score (độ tương tự) và mới nhất
      { _score: { order: "desc" } },
      { createdAt: { order: "desc" } },
    ],
  };

  // 4. Gửi truy vấn lên ES
  const esResult = await elasticClient.search(esQuery);

  // Nếu ES trả về không có hits
  if (esResult.hits.total.value === 0) {
    return [];
  }

  // 5. Lấy danh sách các ES IDs
  const similarIds = esResult.hits.hits.map((hit) => hit._id);

  // 6. Từ Mongo, lấy chi tiết cho những ID đó (giữ thứ tự như ES)
  const postsFromDb = await Post.find(
    { _id: { $in: similarIds } },
    {
      title: 1,
      description: 1,
      address: 1,
      price: 1,
      area: 1,
      utilities: 1,
      services: 1,
      media: 1,
      location: 1,
      contactName: 1,
      contactPhone: 1,
      contactZalo: 1,
      createdAt: 1,
      userId: 1,
      // nếu cần thêm các trường khác
    }
  )
    .populate("userId", "name avatar") // Vào user để lấy tên + avatar
    .lean();

  // Tạo map _id → post doc để lookup nhanh và giữ đúng thứ tự
  const dbMap = new Map(postsFromDb.map((p) => [p._id.toString(), p]));

  // 7. Ghép kết quả ES + Mongo và trả về mảng chi tiết
  const similarPosts = esResult.hits.hits.map((hit) => {
    const esDoc = hit._source;
    const mongoDoc = dbMap.get(hit._id.toString()) || {};

    // Bỏ trường status nếu không cần hiển thị
    const { status: _st, ...esWithoutStatus } = esDoc;

    return {
      id: hit._id,
      ...esWithoutStatus,
      ...mongoDoc,
      user: mongoDoc.userId
        ? {
            id: mongoDoc.userId._id.toString(),
            name: mongoDoc.userId.name,
            avatar: mongoDoc.userId.avatar,
          }
        : null,
    };
  });

  return similarPosts;
};

exports.updateStatus = async (postId, newStatus, reason = "") => {
  let typeNoti;
  let contentNoti;

  if (!newStatus) {
    throw new AppError("Vui lòng cung cấp status mới", 400);
  }

  // 1. Lấy post từ MongoDB
  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng tương ứng", 404);
  }

  const oldStatus = post.status;
  const userId = post.userId; // Giả sử post.userId chứa ObjectId của user

  // 2. Nếu chuyển từ không phải "actived" sang "actived" => tăng numberOfPost
  if (oldStatus !== "actived" && newStatus === "actived") {
    await User.findByIdAndUpdate(userId, { $inc: { numberOfPost: 1 } }, { new: true });
  }

  // 3. Nếu chuyển từ "actived" sang bất kỳ status khác => giảm numberOfPost
  if (oldStatus === "actived" && newStatus !== "actived") {
    await User.findByIdAndUpdate(userId, { $inc: { numberOfPost: -1 } }, { new: true });
  }

  // 4. Cập nhật status mới cho post trong MongoDB
  post.status = newStatus;
  post.reason = reason;
  const updatedPost = await post.save();

  // 5. Đồng bộ status mới lên Elasticsearch
  try {
    await elasticClient.update({
      index: "posts",
      id: postId.toString(),
      doc: {
        status: newStatus,
        reason: reason,
      },
    });
  } catch (esErr) {
    console.error("❌ Lỗi khi cập nhật Elasticsearch:", esErr);
    // Không throw tiếp để không làm gián đoạn API
  }

  if (newStatus === "actived") {
    typeNoti = "AC";
    contentNoti = "Tin của bạn đã được duyệt";
  }

  if (newStatus === "reject") {
    typeNoti = "RJ";
    contentNoti = "Tin của bạn không được duyệt";
  }

  if (newStatus === "disabled") {
    typeNoti = "DI";
    contentNoti = "Tin của bạn đã bị vô hiệu hoá";
  }

  try {
    const notification = await Notification.create({
      receiverId: userId,
      type: typeNoti,
      content: contentNoti,
      isRead: false,
      metadata: { postId: updatedPost._id },
    });

    const io = getIO();
    io.to(`user-${userId.toString()}`).emit("notification", notification);
  } catch (err) {
    console.error("❌ Tạo hoặc gửi Notification thất bại:", err);
  }

  return updatedPost;
};

exports.delete = async (userId, id) => {
  // 1. Tìm post
  const post = await Post.findById(id);
  if (!post || post.userId.toString() !== userId) {
    throw new AppError(404, "Post không tồn tại");
  }

  // 2. Xoá khỏi MongoDB
  await Post.findByIdAndDelete(id);
  // 3. Xoá khỏi Elasticsearch
  try {
    await elasticClient.delete({
      index: "posts",
      id: id.toString(),
    });
  } catch (err) {
    console.error("❌ Elasticsearch delete failed:", err);
    // Không throw để không block API
  }

  // 4. Trả về kết quả
  return { id, message: "Xoá bài đăng thành công" };
};

exports.markPostRented = async (userId, postId, newStatus) => {
  if (!newStatus) {
    throw new AppError("Vui lòng cung cấp status mới", 400);
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng tương ứng", 404);
  }

  if (userId !== post.userId.toString()) {
    throw new AppError("Bạn không có quyền", 403);
  }
  if (newStatus === "rented") {
    await User.findByIdAndUpdate(userId, { $inc: { numberOfPostRented: 1 } }, { new: true });
  }

  if (newStatus === "actived") {
    await User.findByIdAndUpdate(userId, { $inc: { numberOfPostRented: -1 } }, { new: true });
  }

  post.status = newStatus;
  const updatedPost = await post.save();

  // 5. Đồng bộ status mới lên Elasticsearch
  try {
    await elasticClient.update({
      index: "posts",
      id: postId.toString(),
      doc: {
        status: newStatus,
      },
    });
  } catch (esErr) {
    console.error("❌ Lỗi khi cập nhật Elasticsearch:", esErr);
    // Không throw tiếp để không làm gián đoạn API
  }
  return updatedPost;
};
