import { afterEach, describe, expect, it } from "vitest";

import { validateEnvVars, getEnv, isProd, isDev } from "../src/config/env-validator";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("validateEnvVars", () => {
  it("passes when all present", () => {
    process.env.FOO_A = "1";
    process.env.FOO_B = "2";
    expect(() => validateEnvVars(["FOO_A", "FOO_B"])).not.toThrow();
  });
  it("throws 503 listing the missing ones", () => {
    delete process.env.MISSING_ONE;
    expect(() => validateEnvVars(["MISSING_ONE"])).toThrow(/MISSING_ONE/);
    try {
      validateEnvVars(["MISSING_ONE"]);
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(503);
    }
  });
});

describe("getEnv", () => {
  it("returns the value when set", () => {
    process.env.SOME_KEY = "v";
    expect(getEnv("SOME_KEY")).toBe("v");
  });
  it("returns the default when unset", () => {
    delete process.env.NOPE;
    expect(getEnv("NOPE", "fallback")).toBe("fallback");
  });
  it("throws when unset and no default", () => {
    delete process.env.NOPE2;
    expect(() => getEnv("NOPE2")).toThrow(/not set/);
  });
});

describe("isProd / isDev", () => {
  it("reflect NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    expect(isProd()).toBe(true);
    expect(isDev()).toBe(false);
    process.env.NODE_ENV = "development";
    expect(isProd()).toBe(false);
    expect(isDev()).toBe(true);
  });
});
