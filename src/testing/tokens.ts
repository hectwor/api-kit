import { generateToken, type TokenSignOptions } from "../auth/jwt";

/**
 * Sign a JWT for tests. Defaults to a `{ _id }` payload and the key
 * `"test-secret"` — matching a `createValidateToken({ getKey: () => "test-secret" })`.
 */
export function issueTestToken(payload: Record<string, unknown>, key = "test-secret", options?: TokenSignOptions): string {
  return generateToken(payload, key, options);
}

/** Convenience: a token for a user id (default claim shape `{ _id }`). */
export function issueUserToken(userId: string, key = "test-secret", options?: TokenSignOptions): string {
  return issueTestToken({ _id: userId }, key, options);
}

/** Build an `Authorization: Bearer …` header object for supertest `.set(...)`. */
export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
