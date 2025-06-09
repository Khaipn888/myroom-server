const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError"); // điều chỉnh đường dẫn nếu cần

module.exports = (req, res, next) => {
  const token = req.cookies?.accessToken;

  if (!token) {
    return next(new AppError("Không tìm thấy token trong cookie", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded; // gán user vào req để sử dụng ở controller
    next();
  } catch (err) {
    return next(new AppError("Token không hợp lệ hoặc đã hết hạn", 403));
  }
};