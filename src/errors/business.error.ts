/**
 * Base BusinessError class for all application-specific errors.
 * Provides standardized error handling with HTTP status codes and message codes.
 */
export class BusinessError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly messageCode: string;
  public readonly details?: Record<string, unknown>;
  public name: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "BUSINESS_ERROR",
    messageCode: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
    this.statusCode = statusCode;
    this.code = code;
    this.messageCode = messageCode;
    this.details = details;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BusinessError);
    }
  }

  /**
   * Convert error to JSON response format
   */
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      messageCode: this.messageCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Standard 404 error.
 */
export class NotFoundError extends BusinessError {
  constructor(message: string = "Resource not found", details?: Record<string, unknown>) {
    super(message, 404, "NOT_FOUND", "NOT_FOUND", details);
    this.name = "NotFoundError";
  }
}

/**
 * Standard 409 error.
 */
export class ConflictError extends BusinessError {
  constructor(message: string = "Resource already exists", details?: Record<string, unknown>) {
    super(message, 409, "ALREADY_EXISTS", "ALREADY_EXISTS", details);
    this.name = "ConflictError";
  }
}

/**
 * Standard 401 error.
 */
export class UnauthorizedError extends BusinessError {
  constructor(message: string = "Unauthorized", details?: Record<string, unknown>) {
    super(message, 401, "UNAUTHORIZED", "UNAUTHORIZED", details);
    this.name = "UnauthorizedError";
  }
}

/**
 * Standard 403 error.
 */
export class ForbiddenError extends BusinessError {
  constructor(message: string = "Forbidden", details?: Record<string, unknown>) {
    super(message, 403, "FORBIDDEN", "FORBIDDEN", details);
    this.name = "ForbiddenError";
  }
}

/**
 * Standard 422 error.
 */
export class UnprocessableError extends BusinessError {
  constructor(message: string = "Validation error", details?: Record<string, unknown>) {
    super(message, 422, "VALIDATION_ERROR", "VALIDATION_ERROR", details);
    this.name = "UnprocessableError";
  }
}
