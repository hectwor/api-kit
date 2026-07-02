export const sanitizeString = (input: string): string => {
  if (!input || typeof input !== "string") return input;

  return (
    input
      // Remove script tags and content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove event handlers
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/on\w+\s*=\s*[^\s>]*/gi, "")
      // Remove iframe tags
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      // Remove other potentially dangerous tags
      .replace(/<embed[^>]*>/gi, "")
      .replace(/<object[^>]*>/gi, "")
      // Encode HTML special characters
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      // Trim whitespace
      .trim()
  );
};

export const decodeHtmlEntities = (input: string): string => {
  if (!input || typeof input !== "string") return input;

  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
};

/**
 * Sanitize email to prevent injection
 */
export const sanitizeEmail = (email: string): string => {
  if (!email || typeof email !== "string") return email;
  return email.toLowerCase().trim();
};

/**
 * Sanitize numeric value
 */
export const sanitizeNumber = (input: unknown): number | null => {
  const num = parseFloat(String(input));
  return isNaN(num) ? null : num;
};

/**
 * Sanitize object recursively - removes XSS from all string fields
 */
export const sanitizeObject = <T extends object>(obj: T): T => {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (typeof value === "string") {
        (sanitized as Record<string, unknown>)[key] = sanitizeString(value);
      } else if (value && typeof value === "object") {
        (sanitized as Record<string, unknown>)[key] = sanitizeObject(value as T);
      } else {
        (sanitized as Record<string, unknown>)[key] = value as unknown;
      }
    }
  }

  return sanitized as T;
};

/**
 * Validate and sanitize data
 */
export const validateAndSanitize = <T extends object>(data: T): T => {
  if (!data) return data;
  return sanitizeObject(data);
};
