const express = require("express");
const router = express.Router();
const postController = require("../controllers/post.controller");
const auth = require("../middlewares/auth");
const checkAdmin = require("../middlewares/checkAdmin");

router.post("/", auth, postController.create);
router.post("/:id", auth, postController.updatePost);
router.post("/save-draft", auth, postController.saveDraft);
router.post("/censor/update-status", auth, checkAdmin, postController.updateStatus);
router.post("/mark/rented", auth, postController.markPostRented);
router.get("/search-es", postController.searchES);
router.get("/suggestions", postController.suggestions);
router.get("/:id", postController.getDetailPost);
router.delete("/:id", auth, postController.deletePost);
router.get("/my-post/:id",auth , postController.getMyDetailPost);
router.get("/similar/:id", postController.getSimilarPosts);
module.exports = router;
