import { Router } from "express";
import * as followController from "./follow.controller.js";

const router = Router();

router.post("/", followController.follow);
router.delete("/", followController.unfollow);
router.get("/following/:userId", followController.listFollowing);
router.get("/followers/:userId", followController.listFollowers);

export default router;
