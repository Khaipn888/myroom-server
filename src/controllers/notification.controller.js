const notificationService = require("../services/notification.service");
const BaseController = require("../utils/BaseController");
const ResponseFormatter = require("../utils/ResponseFormatter");

exports.getAllNotification = (req, res) => {
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;
    const notifications = await notificationService.getAllNotification(userId);

    res.json(ResponseFormatter.success(notifications, "Lấy danh sách thông báo thành công"));
  });
};

exports.readNotification = (req, res) => {
  BaseController.handle(req, res, async () => {
    const id = req.params.id;
    await notificationService.readNotification(id);
    res.json(ResponseFormatter.success(null, "success"));
  });
};