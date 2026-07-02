import jwt from "jsonwebtoken";

export interface TokenSignOptions {
  /** Signing algorithm. Default: HS256. */
  algorithm?: jwt.Algorithm;
  /** Expiry for regular sessions. Default: "10m". */
  expiresIn?: string | number;
  /** Expiry when `remember` is set. Default: "7 days". */
  rememberExpiresIn?: string | number;
  /** Use the long-lived expiry. */
  remember?: boolean;
}

export interface TokenVerificationResult {
  success: boolean;
  data: Record<string, unknown> & {
    iat?: number;
    exp?: number;
    name?: string;
    message?: string;
    expiredAt?: Date;
  };
}

/**
 * Sign a JWT. Accepts a boolean as third argument for backwards compatibility
 * with the `remember` flag, or a full options object.
 */
export const generateToken = (body: Record<string, unknown>, key: string, optionsOrRemember?: boolean | TokenSignOptions): string => {
  const options: TokenSignOptions = typeof optionsOrRemember === "boolean" ? { remember: optionsOrRemember } : (optionsOrRemember ?? {});

  const expiresIn = options.remember ? (options.rememberExpiresIn ?? "7 days") : (options.expiresIn ?? "10m");

  return jwt.sign(body, key, {
    algorithm: options.algorithm ?? "HS256",
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
  });
};

/**
 * Verify a JWT. Never throws — returns `{ success, data }` where data carries
 * either the decoded payload or the verification error details.
 */
export const verifyToken = (tokenIn: string, key: string): TokenVerificationResult => {
  try {
    return { success: true, data: jwt.verify(tokenIn, key) as TokenVerificationResult["data"] };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError || err instanceof jwt.JsonWebTokenError) {
      return {
        success: false,
        data: { name: err.name, message: err.message, expiredAt: err instanceof jwt.TokenExpiredError ? err.expiredAt : undefined },
      };
    }
    return { success: false, data: { name: "UnknownError", message: "An unknown error occurred during token verification." } };
  }
};
