const reportService = require("../services/report.service");
const BaseController = require("../utils/BaseController");
const ResponseFormatter = require("../utils/ResponseFormatter");

exports.reportPost = (req, res) => {
  BaseController.handle(req, res, async () => {
    const { postId, reasons, otherReason } = req.body;

    const reporterId = req.user ? req.user.id : undefined;

    await reportService.createReport({
      postId,
      reasons,
      otherReason,
      reporterId,
    });

    res.json(ResponseFormatter.success(null, "Báo cáo thành công"));
  });
};
