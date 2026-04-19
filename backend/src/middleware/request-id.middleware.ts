import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const fromHeader = req.get("x-request-id")?.trim();
  const id = fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
