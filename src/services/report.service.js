const ReportModel = require("../models/Report");
const AppError = require("../utils/AppError");
const PostModel = require("../models/Post");
exports.createReport = async ({ postId, reasons, otherReason, reporterId }) => {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    throw new AppError("Phải chọn ít nhất một lý do báo cáo", 400);
  }

  const existing = await ReportModel.findOne({
    postId: postId,
    reporter: reporterId,
  });
  if (existing) {
    throw new AppError("Bạn đã báo cáo tin này rồi", 400);
  }
  // 3. Tạo record mới
  const newReport = await ReportModel.create({
    postId: postId,
    reasons,
    otherReason: otherReason || "",
    reporter: reporterId ? reporterId : undefined,
  });

  await PostModel.findByIdAndUpdate(postId,  { $inc: { reports: 1 } }, { new: true });

  return newReport;
};
