import type { NextFunction, Request, Response } from "express";

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const rid = req.requestId ?? "-";
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${rid}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
