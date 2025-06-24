// src/socket/socket.js
const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");

let ioInstance = null;

/**
 * @param {http.Server} server  – HTTP server trả về từ http.createServer(app)
 */
function initSocket(server) {
  if (!ioInstance) {
    ioInstance = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Middleware xác thực lấy token từ cookie HttpOnly
    ioInstance.use((socket, next) => {
      try {
        const cookies = socket.handshake.headers.cookie;
        if (!cookies) {
          console.log("Socket.IO: Không tìm thấy cookie");
          socket.userId = null;
          socket.userRole = null;
          return next(new Error("Authentication error: No cookie"));
        }

        const parsedCookies = cookie.parse(cookies);
        const token = parsedCookies.accessToken; // đổi tên cookie nếu bạn đặt khác

        if (!token) {
          console.log("Socket.IO: Không tìm thấy token trong cookie");
          socket.userId = null;
          socket.userRole = null;
          return next(new Error("Authentication error: No token"));
        }

        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        console.log("Payload", payload);

        socket.userId = payload.id || null;
        socket.userRole = payload.role || null;

        return next();
      } catch (err) {
        console.log("Socket.IO: Lỗi xác thực token", err.message);
        socket.userId = null;
        socket.userRole = null;
        return next(new Error("Authentication error"));
      }
    });

    ioInstance.on("connection", (socket) => {
      console.log("⚡️ A client connected:", socket.id);
      console.log(`➡️ UserId: ${socket.userId}, Role: ${socket.userRole}`);

      // Cho user join room riêng theo userId
      if (socket.userId) {
        socket.join(`user-${socket.userId}`);
      }

      // Nếu là admin thì join room admin
      if (socket.userRole === "admin") {
        socket.join("admins");
      }

      // Client vẫn có thể gửi event identify nếu muốn (không bắt buộc)
      socket.on("identify", ({ userId, role }) => {
        socket.userId = userId;
        socket.userRole = role;

        if (userId) socket.join(`user-${userId}`);
        if (role === "admin") socket.join("admins");

        console.log(`➡️ Socket ${socket.id} định danh lại userId=${userId}, role=${role}`);
      });

      socket.on("disconnect", () => {
        console.log("❌ A client disconnected:", socket.id);
      });
    });
  }
  console.log("Socket đã được khởi tạo thành công!");
  return ioInstance;
}

/**
 * @returns {Server} instance của Socket.IO (nếu đã init)
 */
function getIO() {
  if (!ioInstance) {
    throw new Error("Socket.IO chưa được khởi tạo! Hãy gọi initSocket(server) trước.");
  }
  return ioInstance;
}

module.exports = { initSocket, getIO };
