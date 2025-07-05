require("dotenv").config();

const http = require('http');
const mongoose = require("mongoose");
const app = require("./src/app");
const { initSocket } = require("./src/socket/socket");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to MongoDB - ${process.env.NODE_ENV}`);
  } catch (err) {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  }
};

connectDB();

const server = http.createServer(app);

initSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} - ${process.env.NODE_ENV}`);
});
