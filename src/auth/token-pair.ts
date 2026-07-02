import type jwt from "jsonwebtoken";

import { InvalidTokenError } from "../errors/auth.error";

import { generateToken, verifyToken } from "./jwt";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IssueOptions {
  /** Long-lived session; carried in the refresh token and honoured on refresh. */
  remember?: boolean;
  /** Extra claims merged into both tokens (e.g. role). */
  claims?: Record<string, unknown>;
}

export interface TokenPairServiceOptions {
  /** Secret for access tokens. */
  accessKey: string;
  /** Secret for refresh tokens (must differ from `accessKey`). */
  refreshKey: string;
  /** Signing algorithm. Default: HS256. */
  algorithm?: jwt.Algorithm;
  /** Access token TTL for normal sessions. Default: "15m". */
  accessTtl?: string | number;
  /** Access token TTL when `remember` is set. Default: "7d". */
  rememberAccessTtl?: string | number;
  /** Refresh token TTL. Default: "7d". */
  refreshTtl?: string | number;
  /** Claim key holding the subject id. Default: "_id". */
  idClaim?: string;
  /**
   * Read the user id from a decoded refresh payload. Default supports both
   * `{ _id }` and legacy `{ user: { _id } }` shapes.
   */
  extractUserId?: (payload: Record<string, unknown>) => string | undefined;
}

function defaultExtractUserId(payload: Record<string, unknown>): string | undefined {
  const p = payload as { _id?: string; user?: { _id?: string } };
  return p._id ?? p.user?._id;
}

/**
 * Stateless access/refresh token pair service.
 *
 * No database, no rotation bookkeeping: `refresh()` verifies the refresh JWT's
 * signature/expiry and mints a fresh pair, preserving the original `remember`
 * choice. Generalises the pattern used in production without the unused
 * persistence layer.
 */
export class TokenPairService {
  private readonly accessKey: string;
  private readonly refreshKey: string;
  private readonly algorithm: jwt.Algorithm;
  private readonly accessTtl: string | number;
  private readonly rememberAccessTtl: string | number;
  private readonly refreshTtl: string | number;
  private readonly idClaim: string;
  private readonly extractUserId: (payload: Record<string, unknown>) => string | undefined;

  constructor(options: TokenPairServiceOptions) {
    if (!options.accessKey) throw new InvalidTokenError("accessKey is required");
    if (!options.refreshKey) throw new InvalidTokenError("refreshKey is required");
    this.accessKey = options.accessKey;
    this.refreshKey = options.refreshKey;
    this.algorithm = options.algorithm ?? "HS256";
    this.accessTtl = options.accessTtl ?? "15m";
    this.rememberAccessTtl = options.rememberAccessTtl ?? "7d";
    this.refreshTtl = options.refreshTtl ?? "7d";
    this.idClaim = options.idClaim ?? "_id";
    this.extractUserId = options.extractUserId ?? defaultExtractUserId;
  }

  /** Mint a fresh access + refresh pair for a user. */
  issue(userId: string, options: IssueOptions = {}): TokenPair {
    const remember = options.remember ?? false;
    const base = { [this.idClaim]: userId, ...options.claims };

    const accessToken = generateToken(base, this.accessKey, {
      algorithm: this.algorithm,
      expiresIn: remember ? this.rememberAccessTtl : this.accessTtl,
    });
    const refreshToken = generateToken({ ...base, remember }, this.refreshKey, {
      algorithm: this.algorithm,
      expiresIn: this.refreshTtl,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Verify a refresh token and mint a new pair. Throws {@link InvalidTokenError}
   * when the token is invalid, expired, or malformed.
   */
  refresh(refreshToken: string): TokenPair {
    const result = verifyToken(refreshToken, this.refreshKey);
    if (!result.success) {
      throw new InvalidTokenError("Invalid or expired refresh token");
    }
    const userId = this.extractUserId(result.data);
    if (!userId) {
      throw new InvalidTokenError("Refresh token payload is missing the user id");
    }
    const remember = (result.data as { remember?: boolean }).remember ?? false;
    return this.issue(userId, { remember });
  }
}
