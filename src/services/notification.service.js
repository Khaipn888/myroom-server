const NotificationModel = require("../models/Notification");
const AppError = require("../utils/AppError");
exports.getAllNotification = async (userId) => {
  const notifications = await NotificationModel.find({
    receiverId: userId,
  }).sort({ createdAt: -1 });

  return notifications;
};

exports.readNotification = async (id) => {
  const notifications = await NotificationModel.findByIdAndUpdate(id, {
    isRead: true,
  });
  return;
};
