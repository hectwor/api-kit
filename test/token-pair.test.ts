import { describe, expect, it } from "vitest";

import { TokenPairService } from "../src/auth/token-pair";
import { verifyToken } from "../src/auth/jwt";

const opts = { accessKey: "access-secret", refreshKey: "refresh-secret" };

describe("TokenPairService", () => {
  it("issues a verifiable access + refresh pair carrying the user id", () => {
    const svc = new TokenPairService(opts);
    const { accessToken, refreshToken } = svc.issue("user-1");

    const access = verifyToken(accessToken, opts.accessKey);
    const refresh = verifyToken(refreshToken, opts.refreshKey);
    expect(access.success).toBe(true);
    expect(access.data._id).toBe("user-1");
    expect(refresh.success).toBe(true);
    expect(refresh.data._id).toBe("user-1");
  });

  it("refresh() mints a new pair from a valid refresh token", () => {
    const svc = new TokenPairService(opts);
    const first = svc.issue("user-1", { remember: true });
    const next = svc.refresh(first.refreshToken);

    const access = verifyToken(next.accessToken, opts.accessKey);
    expect(access.success).toBe(true);
    expect(access.data._id).toBe("user-1");
    // remember flag is preserved across refresh
    const refresh = verifyToken(next.refreshToken, opts.refreshKey);
    expect(refresh.data.remember).toBe(true);
  });

  it("refresh() rejects a token signed with the wrong key", () => {
    const svc = new TokenPairService(opts);
    // An access token is signed with accessKey, not refreshKey → invalid as refresh.
    const { accessToken } = svc.issue("user-1");
    expect(() => svc.refresh(accessToken)).toThrow(/refresh token/i);
  });

  it("refresh() rejects garbage", () => {
    const svc = new TokenPairService(opts);
    expect(() => svc.refresh("not-a-jwt")).toThrow();
  });

  it("supports a custom id claim + extractor", () => {
    const svc = new TokenPairService({
      ...opts,
      idClaim: "sub",
      extractUserId: (p) => p.sub as string | undefined,
    });
    const pair = svc.issue("u9");
    expect(verifyToken(pair.accessToken, opts.accessKey).data.sub).toBe("u9");
    // refresh round-trips using the custom extractor
    const next = svc.refresh(pair.refreshToken);
    expect(verifyToken(next.accessToken, opts.accessKey).data.sub).toBe("u9");
  });

  it("throws when keys are missing", () => {
    expect(() => new TokenPairService({ accessKey: "", refreshKey: "x" })).toThrow();
  });
});
