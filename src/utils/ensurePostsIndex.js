// src/utils/ensurePostsIndex.js
async function ensurePostsIndex(client) {
  const INDEX = "posts";

  const exists = await client.indices.exists({ index: INDEX });
  if (exists) {
    // Nếu bạn muốn RECREATE index mỗi lần dev, có thể xoá và tạo lại:
    // await client.indices.delete({ index: INDEX });
    // Còn nếu production thì chỉ chạy lần đầu, nên return ngay:
    return;
  }

  await client.indices.create({
    index: INDEX,
    body: {
      settings: {
        analysis: {
          analyzer: {
            folded_analyzer: {
              tokenizer: "standard",
              filter: ["lowercase", "asciifolding"],
            },
          },
        },
      },
      mappings: {
        properties: {
          userId: { type: "keyword" },
          title: {
            type: "text",
            analyzer: "folded_analyzer",
            search_analyzer: "folded_analyzer",
          },
          address: {
            type: "text",
            analyzer: "folded_analyzer",
            search_analyzer: "folded_analyzer",
          },
          description: { type: "text" },
          price: { type: "double" },
          area: { type: "double" },
          type: { type: "keyword" },
          createdAt: { type: "date" },
          utilities: { type: "keyword" },
          peoplePerRoom: { type: "keyword" },
          services: {
            type: "nested", // hoặc "object"
            properties: {
              _id: { type: "keyword" },
              name: { type: "text", analyzer: "folded_analyzer" },
              price: { type: "double" },
              unit: { type: "keyword" },
            },
          },
          status: { type: "keyword" },
        },
      },
    },
  });

  console.log("✅ Index 'posts' đã được tạo với folded_analyzer");
}

module.exports = { ensurePostsIndex };
