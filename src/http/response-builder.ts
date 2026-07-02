import type express from "express";

import type { SuccessApiResponse, ErrorApiResponse, ResponseMetadata } from "./api-response.types";
import { messagesEn, type MessageCatalog } from "./messages";

export interface ResponseBuilderOptions {
  /** Value of `metadata.version` in every response. Default: "1.0". */
  version?: string;
  /** Value of `metadata.environment`. Default: process.env.NODE_ENV || "development". */
  environment?: string;
  /** Message catalog used for default texts. Default: messagesEn. */
  messages?: MessageCatalog;
}

/**
 * ResponseBuilder - Centralized response creation using Builder pattern.
 * Ensures a consistent envelope across all API responses:
 * `{ message: { code, text }, data | error, metadata }`.
 *
 * Instantiate one per app (usually via `createApiKit`) so version, environment
 * and message catalog are fixed at bootstrap.
 */
export class ResponseBuilder {
  private readonly version: string;
  private readonly environment: string;
  readonly messages: MessageCatalog;

  constructor(options: ResponseBuilderOptions = {}) {
    this.version = options.version ?? "1.0";
    this.environment = options.environment ?? process.env.NODE_ENV ?? "development";
    this.messages = options.messages ?? messagesEn;
  }

  /**
   * Build response metadata for a request/response pair.
   */
  private buildMetadata(req: express.Request, res: express.Response, statusCode: number): ResponseMetadata {
    const requestIdHeader = req.headers["x-request-id"];
    const requestId = typeof requestIdHeader === "string" ? requestIdHeader : this.generateRequestId();

    const startTime = res.locals?.requestStartTime as number | undefined;
    const duration = startTime ? `${Date.now() - startTime}ms` : undefined;

    return {
      timestamp: new Date().toISOString(),
      version: this.version,
      statusCode,
      requestId,
      path: req.path,
      method: req.method,
      ...(duration && { duration }),
      environment: this.environment,
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Build success response (without sending it)
   */
  success<T>(
    req: express.Request,
    res: express.Response,
    data: T,
    messageCode: string,
    messageText: string,
    statusCode: number = 200,
  ): SuccessApiResponse<T> {
    return {
      message: { code: messageCode, text: messageText },
      data,
      metadata: this.buildMetadata(req, res, statusCode),
    };
  }

  /**
   * Build error response (without sending it)
   */
  error(
    req: express.Request,
    res: express.Response,
    errorCode: string,
    errorMessage: string,
    statusCode: number = 400,
    details?: unknown,
    messageCode: string = "ERROR",
    messageText?: string,
  ): ErrorApiResponse {
    const errorObj: { code: string; message: string; details?: unknown } = {
      code: errorCode,
      message: errorMessage,
    };
    if (details) {
      errorObj.details = details;
    }

    return {
      message: { code: messageCode, text: messageText ?? this.messages.ERROR ?? "An error occurred" },
      error: errorObj,
      metadata: this.buildMetadata(req, res, statusCode),
    };
  }

  /**
   * Send success response
   */
  sendSuccess<T>(res: express.Response, data: T, messageCode: string, messageText: string, statusCode: number = 200): express.Response {
    return res.status(statusCode).json(this.success(res.req, res, data, messageCode, messageText, statusCode));
  }

  /**
   * Send error response
   */
  sendError(
    res: express.Response,
    errorCode: string,
    errorMessage: string,
    statusCode: number = 400,
    details?: unknown,
    messageCode: string = "ERROR",
    messageText?: string,
  ): express.Response {
    return res.status(statusCode).json(this.error(res.req, res, errorCode, errorMessage, statusCode, details, messageCode, messageText));
  }
}
