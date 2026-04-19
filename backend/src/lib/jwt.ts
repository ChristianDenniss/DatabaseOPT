import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

const ACCESS_TYP = "access";
const REFRESH_TYP = "refresh";

function getAccessSecret(): string {
  const s = (process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET)?.trim();
  if (!s) throw new Error("JWT_ACCESS_SECRET or JWT_SECRET must be set");
  return s;
}

function getRefreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET?.trim();
  if (!s) throw new Error("JWT_REFRESH_SECRET is not set");
  return s;
}

function accessExpires(): SignOptions["expiresIn"] {
  return (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"];
}

function refreshExpires(): SignOptions["expiresIn"] {
  return (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
}

export function signAccessToken(sub: string): string {
  return jwt.sign({ sub, typ: ACCESS_TYP }, getAccessSecret(), { expiresIn: accessExpires() });
}

export function signRefreshToken(sub: string): string {
  return jwt.sign(
    { sub, typ: REFRESH_TYP, jti: randomUUID() },
    getRefreshSecret(),
    { expiresIn: refreshExpires() }
  );
}

/** Issue a new access + refresh pair (refresh rotation on each refresh call). */
export function signTokenPair(sub: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken(sub),
    refreshToken: signRefreshToken(sub),
  };
}

export function verifyAccessToken(token: string): { sub: string } {
  const payload = jwt.verify(token, getAccessSecret()) as jwt.JwtPayload & {
    sub?: string;
    typ?: string;
  };
  if (typeof payload.sub !== "string") {
    throw new Error("Invalid token: missing sub");
  }
  if (payload.typ !== undefined && payload.typ !== ACCESS_TYP) {
    throw new Error("Not an access token");
  }
  return { sub: payload.sub };
}

export function verifyRefreshToken(token: string): { sub: string } {
  const payload = jwt.verify(token, getRefreshSecret()) as jwt.JwtPayload & {
    sub?: string;
    typ?: string;
  };
  if (typeof payload.sub !== "string") {
    throw new Error("Invalid token: missing sub");
  }
  if (payload.typ !== REFRESH_TYP) {
    throw new Error("Not a refresh token");
  }
  return { sub: payload.sub };
}
