// scripts/reindex-posts.js
require("dotenv").config();

const mongoose = require("mongoose");
const { Client } = require("@elastic/elasticsearch");
const Post = require("../src/models/Post"); // đường dẫn tới model của bạn
const { ensurePostsIndex } = require("../src/utils/ensurePostsIndex");

// Khởi tạo client với node URL
const elasticClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  auth: {
    apiKey: process.env.ELASTICSEARCH_API_KEY,
  },
});

ensurePostsIndex(elasticClient).catch((err) => {
  console.error("❌ Lỗi khi đảm bảo index 'posts':", err);
  // Tuỳ chọn: process.exit(1);
});

async function reindex() {
  // Kết nối MongoDB
  await mongoose.connect(
    process.env.MONGO_URI ||
      "mongodb+srv://khaipn:khaipn888@cluster0.mzdclye.mongodb.net/my-room?retryWrites=true&w=majority&appName=Cluster0"
  );

  const posts = await Post.find({});
  for (const doc of posts) {
    await elasticClient.index({
      index: "posts",
      id: doc._id.toString(),
      document: {
        userId: doc.userId.toString(),
        title: doc.title,
        address: doc.address,
        description: doc.description,
        price: doc.price,
        area: doc.area,
        type: doc.type,
        createdAt: doc.createdAt,
        utilities: doc.utilities,
        peoplePerRoom: doc.peoplePerRoom,
        services: doc.services,
        status: doc.status,
        reason: doc.reason
      },
    });
  }

  console.log("🔄 Reindex hoàn tất.");
  process.exit(0);
}

reindex().catch((err) => {
  console.error("❌ Lỗi khi reindex:", err);
  process.exit(1);
});
