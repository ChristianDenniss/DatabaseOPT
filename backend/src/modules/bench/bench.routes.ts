import { Router } from "express";
import * as benchController from "./bench.controller.js";

const router = Router();

router.get("/catalog", benchController.getCatalog);
router.get("/column-samples", benchController.getColumnSamples);
router.post("/execute-slot", benchController.postExecuteSlot);

export default router;
