const express = require("express");
const router = express.Router();
const commentController = require("../controllers/comment.controller");
const auth = require("../middlewares/auth");

router.post("/", auth, commentController.createComment);
router.get("/:postId", commentController.getCommentsByPost);
router.delete("/:commentId", auth, commentController.deleteComment);

module.exports = router;