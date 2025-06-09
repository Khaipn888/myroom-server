class ResponseFormatter {
  static success(data = null, message = "Success") {
    return {
      success: true,
      message,
      data,
    };
  }

  static error(message = "Something went wrong", error = null) {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      success: false,
      message,
      error: isProduction ? undefined : error,
    };
  }
}

module.exports = ResponseFormatter;