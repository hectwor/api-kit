import type express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Options, Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import type { RedisLike } from "./kv-store";

export type RateLimitStore = Store;

export interface GlobalLimiterOptions {
  windowMs?: number;
  max?: number;
  store?: Store;
}

/**
 * Global IP-based limiter. Mounts BEFORE token validation so the userId header
 * is never set yet — using it here would allow client header spoofing.
 * Defaults: 1000 requests / 15 minutes.
 */
export function makeGlobalLimiter(storeOrOptions?: Store | GlobalLimiterOptions) {
  const options: GlobalLimiterOptions =
    storeOrOptions && typeof (storeOrOptions as Store).increment === "function" ? { store: storeOrOptions as Store } : ((storeOrOptions ?? {}) as GlobalLimiterOptions);

  return rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    max: options.max ?? 1000,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    ...(options.store ? { store: options.store } : {}),
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    skip: (req) => req.method === "OPTIONS",
    handler: rateLimitHandler("global"),
  });
}

/**
 * Per-user limiter. MUST mount after token validation so `req.headers.userId`
 * is already set from the verified JWT — never from the client.
 * Falls back to IP for unauthenticated endpoints (login, refresh token).
 */
export function makeUserLimiter(opts: { name: string; windowMs: number; max: number; store?: Store }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    ...(opts.store ? { store: opts.store } : {}),
    keyGenerator: (req) => {
      const userId = (req.headers.userId as string | undefined)?.trim();
      return userId ? `u:${opts.name}:${userId}` : `ip:${opts.name}:${ipKeyGenerator(req.ip ?? "unknown")}`;
    },
    skip: (req) => req.method === "OPTIONS",
    handler: rateLimitHandler(opts.name),
  });
}

/**
 * Strips client-supplied identity headers before any route runs.
 * Prevents clients from spoofing userId to hijack rate-limit buckets.
 */
export function stripClientIdentityHeaders(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  // Delete all casing variants a client might send.
  delete (req.headers as Record<string, unknown>)["userId"];
  delete (req.headers as Record<string, unknown>)["userid"];
  delete (req.headers as Record<string, unknown>)["USERID"];
  next();
}

/**
 * Build a distributed rate-limit store backed by a Redis-compatible client.
 * Required for multi-instance/serverless deployments; omit for single-process.
 */
export function createRedisRateLimitStore(redis: RedisLike): Store {
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<number>,
  });
}

function rateLimitHandler(name: string): Options["handler"] {
  return (_req, res) => {
    const retryAfter = res.getHeader("Retry-After");
    res.status(429).json({
      message: {
        code: "RATE_LIMITED",
        text: "Too many requests. Please slow down and try again later.",
      },
      metadata: {
        statusCode: 429,
        limiter: name,
        ...(retryAfter != null ? { retryAfter } : {}),
      },
    });
  };
}
