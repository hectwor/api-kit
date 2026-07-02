import type express from "express";

import type { LoggerLike } from "./logger";
import { requestContextStorage } from "./request-context";

/**
 * Request logging middleware factory.
 *
 * - Assigns/propagates `x-request-id` (response header included so clients can correlate retries).
 * - Stores `requestStartTime` in `res.locals` so ResponseBuilder can report duration.
 * - Runs the rest of the request inside AsyncLocalStorage so every downstream
 *   logger call automatically includes the requestId.
 */
export function createRequestLogging(logger: LoggerLike): express.RequestHandler {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = (req.headers["x-request-id"] as string) || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    res.locals.requestId = requestId;
    res.locals.requestStartTime = startTime;
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);

    requestContextStorage.run({ requestId }, () => {
      logger.info("Incoming request", {
        method: req.method,
        path: req.path,
        ip: req.ip || req.socket.remoteAddress,
      });

      logger.debug("Request context initialized", { query: req.query });

      const originalJson = res.json;
      res.json = function (body: unknown) {
        const duration = Date.now() - startTime;
        logger.info("Outgoing response", {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        });
        logger.debug("Response payload sent", { statusCode: res.statusCode });
        return originalJson.call(this, body);
      };

      next();
    });
  };
}
