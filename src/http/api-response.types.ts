/**
 * Message structure for API responses
 */
export interface ResponseMessage {
  code: string;
  text: string;
}

/**
 * Error structure for error responses
 */
export interface ErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Metadata structure for request tracing and tracking
 */
export interface ResponseMetadata {
  timestamp: string;
  version: string;
  statusCode: number;
  requestId: string;
  path: string;
  method: string;
  duration?: string;
  environment?: string;
}

/**
 * Success response with data
 */
export interface SuccessApiResponse<T = unknown> {
  message: ResponseMessage;
  data: T;
  metadata: ResponseMetadata;
}

/**
 * Error response with error details
 */
export interface ErrorApiResponse {
  message: ResponseMessage;
  error: ErrorDetail;
  metadata: ResponseMetadata;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = unknown> = SuccessApiResponse<T> | ErrorApiResponse;
