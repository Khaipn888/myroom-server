const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");
const auth = require("../middlewares/auth");

router.get("/", auth, invoiceController.getByMonth);
router.get("/export-xlsx-multiple", auth, invoiceController.exportMultipleTables);
router.get("/all/:roomId", auth, invoiceController.getAllOfRoom);
router.post("/", auth, invoiceController.create);
router.patch("/:id/status", auth, invoiceController.updateStatus);

module.exports = router;
