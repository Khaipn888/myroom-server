const express = require("express");
const router = express.Router();
const hostelController = require("../controllers/hostel.controller");
const auth = require("../middlewares/auth");

router.get("/my-hostels", auth, hostelController.getMyHostels);
router.get("/:id", auth, hostelController.getHostelDetail);
router.post("/", auth, hostelController.create);
router.post("/:id", auth, hostelController.update);
router.delete("/:id", auth, hostelController.delete);

module.exports = router;
