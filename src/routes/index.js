const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const postRoutes = require("./post.routes");
const userRoutes = require("./user.routes");
const reportRoutes = require("./report.routes");
const hostelRoutes = require("./hostel.routes");
const roomRoutes = require("./room.routes");
const invoiceRoutes = require("./invoice.routes");

// Gắn các route con
router.use("/auth", authRoutes);
router.use("/post", postRoutes);
router.use("/user", userRoutes);
router.use("/report", reportRoutes);
router.use("/hostel", hostelRoutes);
router.use("/room", roomRoutes);
router.use("/invoice", invoiceRoutes);

module.exports = router;
