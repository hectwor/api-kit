import type express from "express";

import { verifyToken } from "./jwt";
import { ERROR_CODES } from "../http/codes";
import { messagesEn, type MessageCatalog } from "../http/messages";
import type { ResponseBuilder } from "../http/response-builder";
import { HTTP_STATUS } from "../http/status";

export interface ValidateTokenOptions {
  responses: ResponseBuilder;
  /** Signing key, or a getter (useful when env vars load after module init). */
  key?: string;
  getKey?: () => string | undefined;
  /**
   * Extract the user id from the decoded token payload.
   * Default supports both `{ _id }` and the legacy `{ user: { _id } }` shapes.
   */
  extractUserId?: (payload: Record<string, unknown>) => string | undefined;
  /** Optional format gate for the extracted user id (e.g. a UUID regex). */
  userIdPattern?: RegExp;
  /** Catalog for error texts. Default: ResponseBuilder's catalog. */
  messages?: MessageCatalog;
  /** Error text when the key is not configured. */
  misconfigurationMessage?: string;
  /** Error text when the user id fails `userIdPattern`. */
  invalidUserIdMessage?: string;
}

interface DefaultTokenShape {
  user?: { _id?: string };
  _id?: string;
}

const defaultExtractUserId = (payload: Record<string, unknown>): string | undefined => {
  const shaped = payload as DefaultTokenShape;
  return shaped?.user?._id ?? shaped?._id;
};

/**
 * Bearer-token validation middleware factory.
 * On success sets `req.headers.userId` from the verified JWT (never from the
 * client — pair with `stripClientIdentityHeaders`).
 */
export function createValidateToken(options: ValidateTokenOptions): express.RequestHandler {
  const { responses } = options;
  const messages = options.messages ?? responses.messages ?? messagesEn;
  const extractUserId = options.extractUserId ?? defaultExtractUserId;
  const misconfigurationMessage = options.misconfigurationMessage ?? "Server misconfiguration";
  const invalidUserIdMessage = options.invalidUserIdMessage ?? "Invalid token user id format. Please re-authenticate.";

  const resolveKey = (): string | undefined => options.getKey?.() ?? options.key;

  return (req, res, next) => {
    if (!req.headers.authorization) {
      // 401: Missing authorization header
      responses.sendError(
        res,
        ERROR_CODES.MISSING_TOKEN,
        messages.MISSING_TOKEN ?? "Authorization token required",
        HTTP_STATUS.UNAUTHORIZED,
        undefined,
        "UNAUTHORIZED",
      );
      return;
    }

    const bearerToken = req.headers.authorization.split(" ")[1];
    const key = resolveKey();
    if (!key) {
      responses.sendError(res, ERROR_CODES.INVALID_TOKEN, misconfigurationMessage, HTTP_STATUS.UNAUTHORIZED);
      return;
    }

    const verify = verifyToken(bearerToken, key);
    if (!verify.success) {
      // 401: Invalid or expired token
      responses.sendError(
        res,
        ERROR_CODES.INVALID_TOKEN,
        verify.data.expiredAt ? (messages.EXPIRED_TOKEN ?? "Token expired") : (messages.INVALID_TOKEN ?? "Invalid token"),
        HTTP_STATUS.UNAUTHORIZED,
        verify.data.message,
        "UNAUTHORIZED",
      );
      return;
    }

    const userId = extractUserId(verify.data);
    if (!userId) {
      responses.sendError(res, ERROR_CODES.INVALID_TOKEN, messages.INVALID_TOKEN ?? "Invalid token", HTTP_STATUS.UNAUTHORIZED);
      return;
    }

    if (options.userIdPattern && !options.userIdPattern.test(userId)) {
      responses.sendError(res, ERROR_CODES.INVALID_TOKEN, invalidUserIdMessage, HTTP_STATUS.UNAUTHORIZED);
      return;
    }

    req.headers.userId = userId;
    next();
  };
}
