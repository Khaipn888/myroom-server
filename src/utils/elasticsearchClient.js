const { Client } = require("@elastic/elasticsearch");
const { ensurePostsIndex } = require("./ensurePostsIndex");

const elasticClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  // auth: {
  //   username: process.env.ELASTICSEARCH_USERNAME || "elastic",
  //   password: process.env.ELASTICSEARCH_PASSWORD || "changeme",
  // },
});
ensurePostsIndex(elasticClient).catch((err) => {
  console.error("❌ Lỗi khi đảm bảo index 'posts':", err);
  // Tuỳ chọn: process.exit(1);
});
module.exports = elasticClient;
