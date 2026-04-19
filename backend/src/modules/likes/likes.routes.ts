import { Router } from "express";
import * as likesController from "./likes.controller.js";

const router = Router();

router.get("/post/:postId", likesController.getForPost);
router.post("/post/:postId", likesController.likePost);
router.delete("/post/:postId", likesController.unlikePost);

export default router;
