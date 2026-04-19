import type { Request, Response } from "express";
import { userService } from "./user.service.js";
import { listUsersQuerySchema } from "./user.schemas.js";

export async function getById(req: Request, res: Response): Promise<void> {
  const user = await userService.findById(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { limit, offset } = parsed.data;
  const users = await userService.list({ limit, offset });
  res.json({ users, limit, offset });
}
