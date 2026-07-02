/**
 * Environment Variables Validator
 * Ensures all required environment variables are set when the application starts.
 */

import { BusinessError } from "../errors/business.error";

/**
 * Validate that all required environment variables are set.
 * Throws a BusinessError (503) listing the missing ones.
 */
export const validateEnvVars = (required: string[]): void => {
  const missing = required.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    throw new BusinessError(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please configure them in your .env file or as environment variables.",
      503,
      "SERVICE_UNAVAILABLE",
      "SERVICE_UNAVAILABLE",
    );
  }
};

/**
 * Get environment variable with optional default
 */
export const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new BusinessError(`Environment variable ${key} is not set and no default was provided`, 503, "SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE");
  }
  return value || defaultValue || "";
};

/**
 * Check if running in production
 */
export const isProd = (): boolean => process.env.NODE_ENV === "production";

/**
 * Check if running in development
 */
export const isDev = (): boolean => process.env.NODE_ENV !== "production";
