const express = require("express");
const router = express.Router();
const reportController = require("../controllers/report.controller");
const auth = require("../middlewares/auth");

router.post("/", auth, reportController.reportPost);

module.exports = router;
