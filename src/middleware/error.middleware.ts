import type express from "express";

import { ERROR_CODES } from "../http/codes";
import { messagesEn, type MessageCatalog } from "../http/messages";
import type { ResponseBuilder } from "../http/response-builder";
import { HTTP_STATUS } from "../http/status";
import type { LoggerLike } from "../logging/logger";

export interface HandledError extends Error {
  statusCode?: number;
  code?: string | number;
  messageCode?: string;
  details?: Record<string, unknown>;
}

export type CaptureException = (err: unknown, context: { extra?: Record<string, unknown>; tags?: Record<string, string> }) => void;

export interface ErrorMiddlewareOptions {
  logger: LoggerLike;
  responses: ResponseBuilder;
  /** Message catalog for default error texts. Default: the ResponseBuilder's catalog. */
  messages?: MessageCatalog;
  /** Hook invoked for 5xx errors (e.g. Sentry.captureException). */
  captureException?: CaptureException;
}

export interface ErrorMiddleware {
  /** Global error handler — mount last. */
  handleError: (err: HandledError, req: express.Request, res: express.Response, next: express.NextFunction) => void;
  /** 404 handler — mount after all routes. */
  handleNotFound: (req: express.Request, res: express.Response) => void;
}

/**
 * Global error handling middleware factory.
 * Maps BusinessError-style errors, Joi validation errors and common ORM error
 * codes (Prisma P2002/P2003/P2011/P2025 — matched structurally, no ORM
 * dependency) to standardized error responses.
 */
export function createErrorMiddleware(options: ErrorMiddlewareOptions): ErrorMiddleware {
  const { logger, responses, captureException } = options;
  const messages = options.messages ?? responses.messages ?? messagesEn;

  const text = (code: string): string => messages[code] ?? messages.ERROR ?? "An error occurred";

  function handleError(err: HandledError, req: express.Request, res: express.Response, _next: express.NextFunction): void {
    let statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    let errorCode: string = ERROR_CODES.INTERNAL_ERROR;
    let errorMessage: string = text("INTERNAL_ERROR");
    let messageCode = "INTERNAL_ERROR";
    let details: Record<string, unknown> | undefined;

    if (err.statusCode) {
      statusCode = err.statusCode;
      errorCode = typeof err.code === "string" ? err.code : ERROR_CODES.INTERNAL_ERROR;
      errorMessage = err.message || text("INTERNAL_ERROR");
      messageCode = err.messageCode || "INTERNAL_ERROR";
      details = err.details;
    } else if (err.name === "ValidationError") {
      // Joi validation errors
      statusCode = HTTP_STATUS.UNPROCESSABLE_ENTITY;
      errorCode = ERROR_CODES.VALIDATION_ERROR;
      errorMessage = text("VALIDATION_ERROR");
      messageCode = "VALIDATION_ERROR";
      details = (err.details || err.message) as Record<string, unknown>;
    } else if (err.name === "CastError") {
      // DB cast errors
      statusCode = HTTP_STATUS.BAD_REQUEST;
      errorCode = ERROR_CODES.INVALID_INPUT;
      errorMessage = text("INVALID_INPUT");
      messageCode = "INVALID_INPUT";
    } else if (err.code === "P2025") {
      // Prisma record not found for update/delete operations
      statusCode = HTTP_STATUS.NOT_FOUND;
      errorCode = ERROR_CODES.NOT_FOUND;
      errorMessage = text("NOT_FOUND");
      messageCode = "NOT_FOUND";
      details = (err as { meta?: Record<string, unknown> }).meta;
    } else if (err.code === "P2003" || err.code === "P2011") {
      // Prisma foreign key / null constraint violation
      statusCode = HTTP_STATUS.BAD_REQUEST;
      errorCode = ERROR_CODES.INVALID_INPUT;
      errorMessage = text("INVALID_INPUT");
      messageCode = "INVALID_INPUT";
      details = (err as { meta?: Record<string, unknown> }).meta;
    } else if (err.code === "P2002") {
      // Prisma unique constraint violation
      statusCode = HTTP_STATUS.CONFLICT;
      errorCode = ERROR_CODES.DUPLICATE_ENTRY;
      errorMessage = text("DUPLICATE_ENTRY");
      messageCode = "DUPLICATE_ENTRY";
      details = (err as { meta?: Record<string, unknown> }).meta;
    } else if (err.code === 11000) {
      // Duplicate key error (MongoDB)
      statusCode = HTTP_STATUS.CONFLICT;
      errorCode = ERROR_CODES.DUPLICATE_ENTRY;
      errorMessage = text("DUPLICATE_ENTRY");
      messageCode = "DUPLICATE_ENTRY";
    }

    const requestIdHeader = req.headers["x-request-id"];
    const requestId = typeof requestIdHeader === "string" ? requestIdHeader : (res.locals?.requestId as string | undefined);
    const logPayload = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      errorCode,
      errorMessage,
      errorName: err.name,
      stack: err.stack,
      details,
    };

    if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      logger.error("Request failed", logPayload);
      captureException?.(err, {
        extra: logPayload,
        tags: { requestId: requestId ?? "unknown" },
      });
    } else {
      logger.warn("Request rejected", logPayload);
    }

    responses.sendError(res, errorCode, errorMessage, statusCode, details, messageCode, text(messageCode));
  }

  function handleNotFound(req: express.Request, res: express.Response): void {
    logger.warn("Route not found", {
      requestId: req.headers["x-request-id"],
      method: req.method,
      path: req.path,
    });

    responses.sendError(res, ERROR_CODES.NOT_FOUND, text("NOT_FOUND"), HTTP_STATUS.NOT_FOUND, undefined, "NOT_FOUND", text("NOT_FOUND_ROUTE"));
  }

  return { handleError, handleNotFound };
}
