import { Router } from "express";
import * as authController from "./auth.controller.js";

const router = Router();

router.post("/token", authController.issueDevToken);
router.post("/refresh", authController.refreshTokens);

export default router;
