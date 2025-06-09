const express = require("express");
const router = express.Router();
const roomController = require("../controllers/room.controller");
const auth = require("../middlewares/auth");

router.get("/:id", auth, roomController.getroomDetail);
router.post("/", auth, roomController.create);
router.post("/add-member", auth, roomController.addMember);
router.post("/member/:id", auth, roomController.updateMember);
router.post("/:id", auth, roomController.update);
router.delete("/:id", auth, roomController.delete);
router.delete("/member/:id", auth, roomController.deleteMember);

module.exports = router;
