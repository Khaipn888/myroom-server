class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true; // dùng để phân biệt lỗi có thể xử lý

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;