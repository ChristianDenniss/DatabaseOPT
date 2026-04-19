import { Router } from "express";
import * as userController from "./user.controller.js";

const router = Router();

router.get("/", userController.list);
router.get("/:id", userController.getById);

export default router;
