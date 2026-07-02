import { BusinessError } from "./business.error";

/**
 * Base AuthError class
 */
export class AuthError extends BusinessError {
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "AUTH_ERROR",
    messageCode: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>,
  ) {
    super(message, statusCode, code, messageCode, details);
    this.name = "AuthError";
  }
}

/**
 * Thrown when token is invalid or expired (401)
 */
export class InvalidTokenError extends AuthError {
  constructor(reason: string = "Token invalid or expired", details?: Record<string, unknown>) {
    super(reason, 401, "INVALID_TOKEN", "UNAUTHORIZED", details);
    this.name = "InvalidTokenError";
  }
}

/**
 * Thrown when token is missing (401)
 */
export class MissingTokenError extends AuthError {
  constructor(details?: Record<string, unknown>) {
    super("Authorization token is required", 401, "MISSING_TOKEN", "UNAUTHORIZED", details);
    this.name = "MissingTokenError";
  }
}

/**
 * Thrown when token has expired (401)
 */
export class ExpiredTokenError extends AuthError {
  constructor(details?: Record<string, unknown>) {
    super("Token has expired", 401, "EXPIRED_TOKEN", "UNAUTHORIZED", details);
    this.name = "ExpiredTokenError";
  }
}

/**
 * Thrown when user is not authorized for operation (403)
 */
export class UnauthorizedOperationError extends AuthError {
  constructor(reason: string = "Not authorized to perform this operation", details?: Record<string, unknown>) {
    super(reason, 403, "UNAUTHORIZED_OPERATION", "INSUFFICIENT_PERMISSIONS", details);
    this.name = "UnauthorizedOperationError";
  }
}
