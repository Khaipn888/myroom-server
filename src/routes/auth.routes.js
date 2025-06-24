const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.get("/me", auth, authController.me);
router.post("/logout", authController.logout);
router.post("/google", authController.loginWithGoogle);
router.post("/send-otp", authController.sendOtpVerifyAccount);
router.post("/verify-otp", authController.verifyOtp);
router.post("/forgot-password", authController.sendOtpForgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", auth, authController.changePassword);
module.exports = router;
