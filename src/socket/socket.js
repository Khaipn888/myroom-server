// src/socket/socket.js
const { Server } = require('socket.io');

let ioInstance = null;

/**
 * @param {http.Server} server  – HTTP server trả về từ http.createServer(app)
 */
function initSocket(server) {
  // Nếu chưa khởi tạo lần nào thì tạo mới
  if (!ioInstance) {
    ioInstance = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Middleware xác thực (nếu bạn dùng token/JWT). Nếu không cần, có thể bỏ khối này.
    ioInstance.use((socket, next) => {
      // Ví dụ: lấy token từ socket.handshake.auth
      const token = socket.handshake.auth?.token;
      // Nếu cần xác thực, bạn verify token ở đây rồi gán socket.userId = payload.userId
      // Còn không cần, chỉ next() luôn
      socket.userId = null;
      return next();
    });

    // Lắng nghe event kết nối
    ioInstance.on('connection', (socket) => {
      console.log('⚡️ A client connected:', socket.id);

      // Ví dụ: client gửi id + role để server biết đây là ai
      socket.on('identify', ({ userId, role }) => {
        socket.userId = userId;
        socket.userRole = role;

        // Cho user join room riêng: "user-<userId>"
        if (userId) {
          socket.join(`user-${userId}`);
        }

        // Giả sử nếu role === 'admin' thì join room "admins"
        if (role === 'admin') {
          socket.join('admins');
        }

        console.log(`➡️ Socket ${socket.id} định danh userId=${userId}, role=${role}`);
      });

      // Xử lý khi client ngắt kết nối
      socket.on('disconnect', () => {
        console.log('❌ A client disconnected:', socket.id);
      });
    });
  }

  return ioInstance;
}

/**
 * @returns {Server}  instance của Socket.IO (nếu đã init)
 */
function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO chưa được khởi tạo! Hãy gọi initSocket(server) trước.');
  }
  return ioInstance;
}

module.exports = { initSocket, getIO };
