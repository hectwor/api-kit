import type express from "express";

import type { KeyValueStore } from "./kv-store";

/**
 * Idempotency middleware for mutating endpoints (POST/PUT/PATCH/DELETE).
 *
 * Clients send: `Idempotency-Key: <uuid>` (optional).
 * On hit: returns the cached response verbatim without re-executing the handler.
 * On miss: executes the handler, caches the response, returns it.
 *
 * Key space: `idem:<userId>:<key>` — scoped per user to prevent cross-user replay.
 * TTL: 24 h (configurable).
 *
 * Usage:
 *   router.post("/foo", validateToken, idempotencyMiddleware(store), handler)
 */
export function idempotencyMiddleware(store: KeyValueStore | null, ttlSeconds = 86_400) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
    // Only gate mutating methods.
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    const key = (req.headers["idempotency-key"] as string | undefined)?.trim();
    if (!key || !store) {
      next();
      return;
    }

    const userId = (req.headers.userId as string | undefined)?.trim();
    if (!userId) {
      next();
      return;
    }

    const storeKey = `idem:${userId}:${key}`;

    try {
      const cached = await store.get(storeKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { status: number; body: unknown };
        res.status(parsed.status).json(parsed.body);
        return;
      }
    } catch {
      // Store error: skip caching, let request through.
      next();
      return;
    }

    // Monkey-patch res.json to capture the outgoing response.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      // Only cache successful responses (2xx).
      if (status >= 200 && status < 300) {
        const payload = JSON.stringify({ status, body });
        void store.set(storeKey, payload, ttlSeconds).catch(() => undefined);
      }
      return originalJson(body);
    };

    next();
  };
}
