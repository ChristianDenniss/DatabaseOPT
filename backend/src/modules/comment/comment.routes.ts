import { Router } from "express";
import * as commentController from "./comment.controller.js";

const router = Router();

router.get("/", commentController.list);
router.post("/", commentController.create);
router.get("/:id", commentController.getById);

export default router;
