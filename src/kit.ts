import type express from "express";
import type winston from "winston";

import { createRequireUserId, type RequireUserId } from "./auth/request-user";
import { createValidateToken, type ValidateTokenOptions } from "./auth/validate-token.middleware";
import { messagesEn, mergeMessages, type MessageCatalog } from "./http/messages";
import { ResponseBuilder } from "./http/response-builder";
import { createLogger, type LoggerLike } from "./logging/logger";
import { createRequestLogging } from "./logging/request-logging.middleware";
import { createErrorMiddleware, type CaptureException, type ErrorMiddleware } from "./middleware/error.middleware";
import { createSanitizationMiddleware } from "./middleware/sanitization.middleware";
import { createSchemaValidator, type SchemaValidator } from "./validation/schema-validator";

export interface ApiKitOptions {
  /** Service name added to every log entry. */
  service: string;
  /** Reported in `metadata.environment`. Default: process.env.NODE_ENV || "development". */
  environment?: string;
  /** Reported in `metadata.version`. Default: "1.0". */
  responseVersion?: string;
  /** Message catalog or partial overrides merged over the English defaults. */
  messages?: Partial<MessageCatalog>;
  /** Logger options, or a pre-built logger instance. */
  logger?: { level?: string; pretty?: boolean } | LoggerLike;
  /** Observability hooks. */
  capture?: { exception?: CaptureException };
}

/**
 * Configured, cohesive instance of the framework's cross-cutting pieces.
 * Create one per application at bootstrap and re-export what routes need.
 */
export interface ApiKit {
  logger: LoggerLike;
  messages: MessageCatalog;
  responses: ResponseBuilder;
  errors: ErrorMiddleware;
  requestLogging: express.RequestHandler;
  sanitization: express.RequestHandler;
  validateSchema: SchemaValidator;
  requireUserId: RequireUserId;
  /** Build a token-validation middleware bound to this kit's responses/messages. */
  validateToken: (options: Omit<ValidateTokenOptions, "responses" | "messages">) => express.RequestHandler;
}

function isLoggerLike(value: unknown): value is LoggerLike {
  return typeof value === "object" && value !== null && typeof (value as LoggerLike).info === "function" && typeof (value as LoggerLike).error === "function";
}

/**
 * Assemble the framework: logger, response builder, error middleware,
 * request logging, sanitization and validation — all sharing one config.
 * No global state: multiple kits can coexist in one process.
 */
export function createApiKit(options: ApiKitOptions): ApiKit {
  const messages = mergeMessages(messagesEn, options.messages);

  const logger: LoggerLike = isLoggerLike(options.logger)
    ? options.logger
    : (createLogger({
        service: options.service,
        level: (options.logger as { level?: string } | undefined)?.level,
        pretty: (options.logger as { pretty?: boolean } | undefined)?.pretty,
      }) as winston.Logger);

  const responses = new ResponseBuilder({
    version: options.responseVersion,
    environment: options.environment,
    messages,
  });

  const errors = createErrorMiddleware({
    logger,
    responses,
    messages,
    captureException: options.capture?.exception,
  });

  return {
    logger,
    messages,
    responses,
    errors,
    requestLogging: createRequestLogging(logger),
    sanitization: createSanitizationMiddleware(logger),
    validateSchema: createSchemaValidator({ responses, messages }),
    requireUserId: createRequireUserId(messages),
    validateToken: (tokenOptions) => createValidateToken({ ...tokenOptions, responses, messages }),
  };
}
