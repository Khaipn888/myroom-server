// services/authService.js
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateToken");
const axios = require("axios");
const { customAlphabet } = require("nanoid");
const nodemailer = require("nodemailer");

const generateUserCode = () => {
  return customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
};

exports.loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError("Thiếu thông tin đăng nhập", 400);
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Tài khoản hoặc mật khẩu không đúng", 400);
  }
  if (!user.isVerified) {
    throw new AppError("Tài khoản chưa được xác thực. Vui lòng nhập mã OTP từ email.", 401);
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new AppError("Tài khoản hoặc mật khẩu không đúng", 400);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  // Xóa mật khẩu trước khi trả về
  const userObj = user.toObject();
  delete userObj.password;

  return { user: userObj, accessToken, refreshToken };
};

exports.registerUser = async ({ email, password, name }) => {
  if (!email || !password) {
    throw new AppError("Thiếu thông tin đăng ký", 400);
  }

  const existingUser = await User.findOne({ email }).select("-password");
  if (existingUser) {
    throw new AppError("Email đã được sử dụng", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  // Tạo code cho user
  let uniqueCode;
  let isUnique = false;
  do {
    uniqueCode = generateUserCode()();
    const conflict = await User.findOne({ code: uniqueCode });
    if (!conflict) isUnique = true;
  } while (!isUnique);
  const newUser = await User.create({ email, password: hashedPassword, name, code: uniqueCode });

  const accessToken = generateAccessToken(newUser);
  const refreshToken = generateRefreshToken(newUser);

  newUser.refreshToken = refreshToken;
  await newUser.save();

  return { user: newUser, accessToken, refreshToken };
};

exports.getUserProfile = async (userId) => {
  const user = await User.findById(userId).select("-password -refreshToken");
  if (!user) {
    throw new AppError("Người dùng không tồn tại", 404);
  }
  return user;
};

exports.refreshTokenPair = async (token) => {
  if (!token) {
    throw new AppError("Không có refresh token", 401);
  }

  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(payload.id);

  if (!user || user.refreshToken !== token) {
    throw new AppError("Refresh token không hợp lệ", 403);
  }

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  user.refreshToken = newRefreshToken;
  await user.save();

  return { newAccessToken, newRefreshToken };
};

exports.logoutUser = async (token) => {
  if (!token) {
    throw new AppError("Không có token để logout", 400);
  }

  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError("Người dùng không tồn tại", 400);
  }

  user.refreshToken = null;
  await user.save();
};

exports.loginWithGoogle = async (googleToken) => {
  if (!googleToken) {
    throw new AppError("Thiếu token từ Google", 400);
  }

  // 1. Lấy thông tin người dùng từ Google
  const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${googleToken}`,
    },
  });

  const { email, name, picture, sub: googleId } = response.data;

  if (!email) {
    throw new AppError("Không lấy được thông tin email từ Google", 400);
  }

  // 2. Tìm hoặc tạo người dùng
  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      email,
      name,
      avatar: picture,
      googleId,
      password: "", // Google user không có password
    });
  }

  // 3. Tạo accessToken & refreshToken
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;
  await user.save();

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.refreshToken;

  return { user: userObj, accessToken, refreshToken };
};

// xác thực người dùng

const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

exports.sendOtpVerifyAccount = async ({ email }) => {
  if (!email) {
    throw new AppError("Vui lòng cung cấp email", 400);
  }

  // 1.1. Tìm user theo email
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }

  // 1.2. Sinh OTP 6 chữ số ngẫu nhiên
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // VD: "482901"
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút tính từ hiện tại

  // 1.3. Lưu OTP và thời gian hết hạn vào user document
  user.otpCode = otpCode;
  user.otpExpiresAt = expiresAt;
  await user.save();

  // 1.4. Gửi email chứa OTP
  const transporter = createEmailTransporter();
  const mailOptions = {
    from: `"Phòng trọ của tôi" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Mã OTP xác thực tài khoản",
    text: `Chào bạn,\n\nMã OTP để xác thực tài khoản của bạn là: ${otpCode}\nMã có hiệu lực trong 10 phút.\n\nNếu bạn không yêu cầu, vui lòng bỏ qua email này.\n\nTrân trọng,\nPhòng trọ của tôi`,
    html: `
      <p>Chào bạn,</p>
      <p>Mã OTP để xác thực tài khoản của bạn là: <b style="font-size:1.2em;">${otpCode}</b></p>
      <p><i>Mã này có hiệu lực trong 10 phút kể từ khi nhận được email.</i></p>
      <p>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
      <br/>
      <p>Trân trọng,<br/>Phòng trọ của tôi</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { message: "OTP đã được gửi đến email" };
};

// 2. Hàm xác thực OTP
exports.verifyOtp = async ({ email, otp }) => {
  if (!email || !otp) {
    throw new AppError("Vui lòng cung cấp email và mã OTP", 400);
  }

  // 2.1. Tìm user theo email
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }

  // 2.2. Kiểm tra xem user có otpCode và otpExpiresAt hợp lệ
  if (!user.otpCode || !user.otpExpiresAt) {
    throw new AppError("Chưa có mã OTP nào được gửi đến tài khoản này", 400);
  }
  if (user.otpExpiresAt < new Date()) {
    // OTP đã hết hạn
    // Xóa luôn otpCode, otpExpiresAt để người dùng phải yêu cầu lại
    user.otpCode = null;
    user.otpExpiresAt = null;
    await user.save();
    throw new AppError("Mã OTP đã hết hạn", 400);
  }

  // 2.3. So sánh OTP
  if (user.otpCode !== otp) {
    throw new AppError("Mã OTP không chính xác", 400);
  }

  // 2.4. Nếu OTP hợp lệ => xóa otpCode và otpExpiresAt để tránh tái sử dụng
  user.otpCode = null;
  user.otpExpiresAt = null;
  user.isVerified = true;
  await user.save();

  return { message: "Xác thực OTP thành công" };
};

exports.sendOtpForgotPassword = async ({ email }) => {
  if (!email) {
    throw new AppError("Vui lòng cung cấp email", 400);
  }

  // 1.1. Tìm user theo email
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }

  if (user.googleId) {
    throw new AppError("Tài khoản này hiện đang được liên kết với Google", 400);
  }

  // 1.2. Sinh OTP 6 chữ số ngẫu nhiên
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // VD: "482901"
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút tính từ hiện tại

  // 1.3. Lưu OTP và thời gian hết hạn vào user document
  user.otpCode = otpCode;
  user.otpExpiresAt = expiresAt;
  await user.save();

  // 1.4. Gửi email chứa OTP
  const transporter = createEmailTransporter();
  const mailOptions = {
    from: `"Phòng trọ của tôi" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "🔒 Yêu cầu đặt lại mật khẩu",
    text: `
Chào bạn ${email},

Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại Phòng trọ của tôi.

Mã OTP của bạn là: ${otpCode}
(Hiệu lực: 10 phút kể từ lúc nhận được)

Nếu bạn không yêu cầu chức năng này, hãy bỏ qua email và mật khẩu hiện tại của bạn sẽ không thay đổi.

Trân trọng,
Phòng trọ của tôi
  `,
    html: `
  <div style="font-family:Arial, sans-serif; color:#333; line-height:1.5;">
    <h2 style="color:#1890ff;">Xác thực đặt lại mật khẩu</h2>
    <p>Chào bạn <strong>${email}</strong>,</p>
    <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
    <div style="margin:20px 0; padding:15px; background:#f5f5f5; border-radius:5px; text-align:center;">
      <span style="font-size:1.5em; letter-spacing:4px; color:#d4380d;"><strong>${otpCode}</strong></span>
    </div>
    <p style="font-style:italic; color:#555;">
      Mã OTP có hiệu lực trong <strong>10 phút</strong> kể từ khi nhận được email.
    </p>
    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này — mật khẩu hiện tại của bạn sẽ vẫn được giữ nguyên.</p>
    <br/>
    <p>Trân trọng,<br/><strong>Phòng trọ của tôi</strong></p>
    <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
    <p style="font-size:0.85em; color:#999;">
      Email tự động từ hệ thống — vui lòng không trả lời lại email này.<br/>
      © ${new Date().getFullYear()} Phòng trọ của tôi. Mọi quyền được bảo lưu.
    </p>
  </div>
  `,
  };

  await transporter.sendMail(mailOptions);
  return { message: "OTP đã được gửi đến email" };
};

exports.resetPassword = async ({ email, otp, newPassword, confirmPassword }) => {
  if (!email || !otp || !newPassword || !confirmPassword) {
    throw new AppError("Vui lòng cung cấp đủ thông tin", 400);
  }

  if (newPassword !== confirmPassword) {
    throw new AppError("Mật khẩu mới không khớp", 400);
  }
  // 2.1. Tìm user theo email
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }

  // 2.2. Kiểm tra xem user có otpCode và otpExpiresAt hợp lệ
  if (!user.otpCode || !user.otpExpiresAt) {
    throw new AppError("Chưa có mã OTP nào được gửi đến tài khoản này", 400);
  }
  if (user.otpExpiresAt < new Date()) {
    // OTP đã hết hạn
    // Xóa luôn otpCode, otpExpiresAt để người dùng phải yêu cầu lại
    user.otpCode = null;
    user.otpExpiresAt = null;
    await user.save();
    throw new AppError("Mã OTP đã hết hạn", 400);
  }

  // 2.3. So sánh OTP
  if (user.otpCode !== otp) {
    throw new AppError("Mã OTP không chính xác", 400);
  }

  // 2.4. Nếu OTP hợp lệ => xóa otpCode và otpExpiresAt để tránh tái sử dụng
  user.otpCode = null;
  user.otpExpiresAt = null;
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return { message: "Reset mật khẩu thành công" };
};

exports.changePassword = async ({ userId, currentPassword, newPassword }) => {
  if (!userId || !newPassword || !currentPassword) {
    throw new AppError("Vui lòng cung cấp đủ thông tin", 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    throw new AppError("Mật khẩu không chính xác", 400);
  }
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  user.password = hashedNewPassword;
  await user.save();

  return { message: "Đổi mật khẩu thành công" };
};
