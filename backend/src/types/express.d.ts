export {};

declare global {
  namespace Express {
    interface Request {
      /** Correlates logs; set by request-id middleware. */
      requestId?: string;
      /** JWT subject (user id) when `authenticateJwt` runs. */
      user?: { sub: string };
    }
  }
}
