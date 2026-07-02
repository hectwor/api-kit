import winston from "winston";

import { getRequestId } from "./request-context";

/**
 * Minimal structural logger contract used across the framework.
 * `winston.Logger` satisfies it, but any compatible logger can be injected.
 */
export interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): unknown;
  warn(message: string, meta?: Record<string, unknown>): unknown;
  error(message: string, meta?: Record<string, unknown>): unknown;
  debug(message: string, meta?: Record<string, unknown>): unknown;
}

export interface CreateLoggerOptions {
  /** `service` field added to every log entry. */
  service: string;
  /** Minimum level. Default: "debug" when pretty, "info" otherwise. */
  level?: string;
  /** Human-readable colorized output (local dev) instead of JSON. Default: false. */
  pretty?: boolean;
}

// Injects the current requestId from AsyncLocalStorage into every log entry
// so all logs within a request share the same correlation ID.
const correlationFormat = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

/**
 * Create a Winston logger with correlation-ID support.
 * JSON output for production, colorized simple output when `pretty` is set.
 */
export function createLogger(options: CreateLoggerOptions): winston.Logger {
  const pretty = options.pretty ?? false;

  return winston.createLogger({
    level: options.level ?? (pretty ? "debug" : "info"),
    format: winston.format.combine(
      correlationFormat(),
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.errors({ stack: true }),
      pretty
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            }),
          )
        : winston.format.json(),
    ),
    defaultMeta: { service: options.service },
    transports: [
      new winston.transports.Console({
        format: pretty ? winston.format.combine(winston.format.colorize(), winston.format.simple()) : winston.format.json(),
      }),
    ],
  });
}
