const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");

// Gắn các route con
router.use("/auth", authRoutes);

module.exports = router;
