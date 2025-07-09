const authService = require("../services/auth.service");
const AppError = require("../utils/AppError");
const ResponseFormatter = require("../utils/ResponseFormatter");
const BaseController = require("../utils/BaseController");

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 15 * 60 * 1000, // 15 phút
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
  });
};

exports.login = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { user, accessToken, refreshToken } = await authService.loginUser(req.body);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    setAuthCookies(res, accessToken, refreshToken);
    res.json(ResponseFormatter.success(user, "Login successfully"));
  });

exports.register = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { user, accessToken, refreshToken } = await authService.registerUser(req.body);

    if (!user) {
      throw new AppError("Register failed", 400);
    }

    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json(ResponseFormatter.success(user, "Register successfully"));
  });

exports.me = (req, res) =>
  BaseController.handle(req, res, async () => {
    const user = await authService.getUserProfile(req.user.id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    res.json(ResponseFormatter.success(user, "Fetch user profile successfully"));
  });

exports.refreshToken = (req, res) =>
  BaseController.handle(req, res, async () => {
    const token = req.cookies?.refreshToken;
    const { newAccessToken, newRefreshToken } = await authService.refreshTokenPair(token);

    setAuthCookies(res, newAccessToken, newRefreshToken);
    res.json(ResponseFormatter.success());
  });

exports.logout = (req, res) =>
  BaseController.handle(req, res, async () => {
    const token = req.cookies?.refreshToken;
    await authService.logoutUser(token);
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    res.json(ResponseFormatter.success());
  });

exports.loginWithGoogle = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { token } = req.body;

    if (!token) {
      throw new AppError("Thiếu token từ Google", 400);
    }

    const { user, accessToken, refreshToken } = await authService.loginWithGoogle(token);

    setAuthCookies(res, accessToken, refreshToken);
    res.json(ResponseFormatter.success(user, "Login with Google successfully"));
  });

exports.sendOtpVerifyAccount = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { email } = req.body;
    const result = await authService.sendOtpVerifyAccount({ email });
    res.json(ResponseFormatter.success(result, "Đã gửi OTP"));
  });
};

exports.sendOtpForgotPassword = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { email } = req.body;
    const result = await authService.sendOtpForgotPassword({ email });
    res.json(ResponseFormatter.success(result, "Đã gửi OTP"));
  });
};

exports.verifyOtp = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { email, otp } = req.body;
    const result = await authService.verifyOtp({ email, otp });
    res.json(ResponseFormatter.success(result, "OTP đã xác thực thành công"));
  });
};

exports.resetPassword = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { email, otp, newPassword, confirmPassword } = req.body;
    const result = await authService.resetPassword({ email, otp, newPassword, confirmPassword });
    res.json(ResponseFormatter.success(result, "Reset mật khẩu thành công"));
  });
};

exports.changePassword = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { newPassword, currentPassword } = req.body;
    const userId = req.user.id;
    const result = await authService.changePassword({ userId, newPassword, currentPassword });
    res.json(ResponseFormatter.success(result, "Đổi mật khẩu thành công"));
  });
};
