const express = require("express");
const router = express.Router();
const postController = require("../controllers/post.controller");
const auth = require("../middlewares/auth");
const checkAdmin = require("../middlewares/checkAdmin");

router.post("/", auth, postController.create);
router.post("/update-status", auth, checkAdmin, postController.updateStatus);
router.get("/search-es", postController.searchES);
router.get("/suggestions", postController.suggestions);
router.get("/:id", postController.getDetailPost);
router.get("/similar/:id", postController.getSimilarPosts);
module.exports = router;
