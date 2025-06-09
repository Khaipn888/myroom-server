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
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
module.exports = router;
