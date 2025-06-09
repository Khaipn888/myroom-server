const AppError = require("../utils/AppError"); // Import AppError

module.exports = (err, req, res, next) => {
  console.error("❌ Error:", err);

  // Kiểm tra lỗi có phải do AppError không để xử lý hợp lý
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }

  // Nếu không phải AppError thì trả về lỗi server
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};