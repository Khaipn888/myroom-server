const { Client } = require("@elastic/elasticsearch");
const { ensurePostsIndex } = require("./ensurePostsIndex");

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
module.exports = elasticClient;
