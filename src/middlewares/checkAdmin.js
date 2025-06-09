const AppError = require("../utils/AppError");

module.exports = (req, res, next) => {
  // Nếu req.user chưa được gán (chưa chạy middleware xác thực JWT), trả lỗi 401
  if (!req.user) {
    return next(new AppError("Chưa xác thực hoặc không có thông tin người dùng", 401));
  }
  if (req.user.role !== "admin") {
    return next(new AppError("Bạn không có quyền truy cập (AdminRequired)", 403));
  }
  // Nếu là admin thì cho qua
  next();
};
