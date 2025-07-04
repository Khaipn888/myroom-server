const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const auth = require("../middlewares/auth");

router.get("/get-all-notifications", auth, notificationController.getAllNotification);
router.put("/:id", auth, notificationController.readNotification);

module.exports = router;
