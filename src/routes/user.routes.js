const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth");
const checkAdmin = require("../middlewares/checkAdmin");

router.get("/saved-posts", auth, userController.getSavedPosts);
router.get("/get-my-posts", auth, userController.getAllMyPosts);
router.get("/get-my-post-suggestions", auth, userController.getMyPostSearchSuggestions);
router.post("/save-post", auth, userController.savePost);
router.post("/unsave-post", auth, userController.unsavePost);
router.post("/update-me", auth, userController.updateMe);

//admin
router.get("/get-all-posts", auth, checkAdmin, userController.getAllPostsByAdmin);
router.get(
  "/get-all-post-suggestions",
  auth,
  checkAdmin,
  userController.getPostSearchSuggestionsForAdmin
);
router.get("/get-all-users", auth, checkAdmin, userController.getAllUsersByAdmin);
router.get("/get-suggest-users", auth, checkAdmin, userController.suggestUserByKeyword);
router.post("/lock", auth, checkAdmin, userController.lockUser);
router.post("/unlock", auth, checkAdmin, userController.unlockUser);

module.exports = router;
