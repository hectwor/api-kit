/**
 * Custom error classes for resource CRUD operations.
 */

import { BusinessError } from "./business.error";

/**
 * Base ResourceError class for CRUD operations
 */
export class ResourceError extends BusinessError {
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "RESOURCE_ERROR",
    messageCode: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>,
  ) {
    super(message, statusCode, code, messageCode, details);
    this.name = "ResourceError";
  }
}

/**
 * Thrown when resource is not found (404)
 */
export class ResourceNotFoundError extends ResourceError {
  constructor(resourceType: string, resourceId: string, details?: Record<string, unknown>) {
    super(`${resourceType} with id ${resourceId} not found`, 404, `${resourceType.toUpperCase()}_NOT_FOUND`, "RESOURCE_NOT_FOUND", {
      resourceType,
      resourceId,
      ...details,
    });
    this.name = "ResourceNotFoundError";
  }
}

/**
 * Thrown when resource already exists (409)
 */
export class ResourceAlreadyExistsError extends ResourceError {
  constructor(resourceType: string, identifier: string, details?: Record<string, unknown>) {
    super(`${resourceType} with ${identifier} already exists`, 409, `${resourceType.toUpperCase()}_ALREADY_EXISTS`, "ALREADY_EXISTS", {
      resourceType,
      identifier,
      ...details,
    });
    this.name = "ResourceAlreadyExistsError";
  }
}

/**
 * Thrown when resource data is invalid (400)
 */
export class ResourceValidationError extends ResourceError {
  constructor(resourceType: string, message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 400, `${resourceType.toUpperCase()}_VALIDATION_ERROR`, "VALIDATION_ERROR", { resourceType, field, ...details });
    this.name = "ResourceValidationError";
  }
}

/**
 * Thrown when a resource operation is invalid (400)
 */
export class InvalidResourceOperationError extends ResourceError {
  constructor(resourceType: string, operation: string, reason: string, details?: Record<string, unknown>) {
    super(`Cannot ${operation} ${resourceType}: ${reason}`, 400, `${resourceType.toUpperCase()}_INVALID_OPERATION`, "INVALID_OPERATION", {
      resourceType,
      operation,
      reason,
      ...details,
    });
    this.name = "InvalidResourceOperationError";
  }
}

/**
 * Thrown when resource operation fails internally (500)
 */
export class ResourceOperationError extends ResourceError {
  constructor(resourceType: string, operation: string, reason: string, originalError?: unknown) {
    super(
      `Error during ${operation} operation on ${resourceType}: ${reason}`,
      500,
      `${resourceType.toUpperCase()}_${operation.toUpperCase()}_ERROR`,
      "INTERNAL_ERROR",
      {
        resourceType,
        operation,
        originalError: originalError instanceof Error ? originalError.message : undefined,
      },
    );
    this.name = "ResourceOperationError";
  }
}
