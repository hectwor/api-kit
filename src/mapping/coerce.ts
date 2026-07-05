/**
 * Defensive value coercers for marshalling untyped persistence rows / JSON into
 * DTOs. Every backend hand-rolls these; they live here so a DTO layer can just
 * import them. All return `undefined` (never throw) when the value doesn't fit,
 * so they compose with `??` fallbacks.
 */

/** True for a non-null object (note: arrays are objects too, matching `typeof`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The value if it is a string, else `undefined`. */
export function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * A finite number from a number, a non-blank numeric string, or an object that
 * coerces numerically (e.g. a Prisma Decimal); otherwise `undefined`.
 */
export function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const parsed = Number(value as never);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** The value if it is a boolean, else `undefined`. */
export function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** An ISO string from a `Date`, the string as-is if already a string, else `undefined`. */
export function getDateString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/** The array if every element is a string, else `undefined`. */
export function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values : undefined;
}

/** The value if it is a non-null object, else `undefined`. */
export function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** First value that coerces to a non-empty string — for camel/snake column fallbacks. */
export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const str = getString(value);
    if (str !== undefined) return str;
  }
  return undefined;
}

/** Namespaced bundle, for `import { coerce } from "@hectordahv/api-kit/mapping"`. */
export const coerce = {
  isRecord,
  getString,
  getNumber,
  getBoolean,
  getDateString,
  getStringArray,
  getRecord,
  firstString,
};
