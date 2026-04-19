import type { Request, Response } from "express";
import { followService } from "./follow.service.js";
import {
  followBodySchema,
  followPaginationQuerySchema,
  unfollowPayloadSchema,
  userIdParamSchema,
} from "./follow.schemas.js";

export async function follow(req: Request, res: Response): Promise<void> {
  const parsed = followBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { followerId, followingId } = parsed.data;
  try {
    const out = await followService.follow(followerId, followingId);
    res.status(out.created ? 201 : 200).json(out);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg === "User not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg === "Cannot follow yourself") {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function unfollow(req: Request, res: Response): Promise<void> {
  const raw = {
    followerId:
      typeof req.query.followerId === "string"
        ? req.query.followerId
        : req.body?.followerId,
    followingId:
      typeof req.query.followingId === "string"
        ? req.query.followingId
        : req.body?.followingId,
  };
  const parsed = unfollowPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query or body" });
    return;
  }
  const { followerId, followingId } = parsed.data;
  const out = await followService.unfollow(followerId, followingId);
  res.json(out);
}

export async function listFollowing(req: Request, res: Response): Promise<void> {
  const paramsParsed = userIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.issues[0]?.message ?? "Invalid user id" });
    return;
  }
  const qParsed = followPaginationQuerySchema.safeParse(req.query);
  if (!qParsed.success) {
    res.status(400).json({ error: qParsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { limit, offset } = qParsed.data;
  const out = await followService.listFollowing(paramsParsed.data.userId, { limit, offset });
  res.json(out);
}

export async function listFollowers(req: Request, res: Response): Promise<void> {
  const paramsParsed = userIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.issues[0]?.message ?? "Invalid user id" });
    return;
  }
  const qParsed = followPaginationQuerySchema.safeParse(req.query);
  if (!qParsed.success) {
    res.status(400).json({ error: qParsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { limit, offset } = qParsed.data;
  const out = await followService.listFollowers(paramsParsed.data.userId, { limit, offset });
  res.json(out);
}
