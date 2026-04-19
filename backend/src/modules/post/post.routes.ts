import { Router } from "express";
import * as postController from "./post.controller.js";

const router = Router();

router.get("/", postController.list);
router.get("/:id", postController.getById);

export default router;
