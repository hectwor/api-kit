import type express from "express";

import { sanitizeObject } from "./sanitizer";
import type { LoggerLike } from "../logging/logger";

/**
 * Input Sanitization Middleware factory.
 * Automatically sanitizes request body, params, and query to prevent XSS/injection.
 */
export function createSanitizationMiddleware(logger?: LoggerLike): express.RequestHandler {
  return (req, _res, next) => {
    try {
      if (req.body && typeof req.body === "object") {
        req.body = sanitizeObject(req.body);
      }
      if (req.params && typeof req.params === "object") {
        req.params = sanitizeObject(req.params);
      }
      if (req.query && typeof req.query === "object") {
        req.query = sanitizeObject(req.query);
      }
    } catch (error) {
      logger?.warn("Error during input sanitization", { error: error instanceof Error ? error.message : String(error) });
      // Continue even if sanitization fails - don't block requests
    }

    next();
  };
}
