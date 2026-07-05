import { describe, expect, it } from "vitest";

import { firstString, getBoolean, getDateString, getNumber, getRecord, getString, getStringArray, isRecord } from "../src/mapping";

describe("coerce primitives", () => {
  it("getString", () => {
    expect(getString("a")).toBe("a");
    expect(getString(1)).toBeUndefined();
    expect(getString(null)).toBeUndefined();
  });

  it("getNumber from number / numeric string / decimal-like object", () => {
    expect(getNumber(5)).toBe(5);
    expect(getNumber("5.5")).toBe(5.5);
    expect(getNumber("  ")).toBeUndefined();
    expect(getNumber("abc")).toBeUndefined();
    expect(getNumber(NaN)).toBeUndefined();
    expect(getNumber({ valueOf: () => 42 })).toBe(42); // Prisma Decimal-like
  });

  it("getBoolean", () => {
    expect(getBoolean(true)).toBe(true);
    expect(getBoolean("true")).toBeUndefined();
  });

  it("getDateString from Date and string", () => {
    expect(getDateString(new Date("2020-01-01T00:00:00.000Z"))).toBe("2020-01-01T00:00:00.000Z");
    expect(getDateString("2020")).toBe("2020");
    expect(getDateString(5)).toBeUndefined();
  });

  it("getStringArray only when all elements are strings", () => {
    expect(getStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(getStringArray(["a", 1])).toBeUndefined();
    expect(getStringArray("a")).toBeUndefined();
  });

  it("isRecord / getRecord", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(getRecord({ a: 1 })).toEqual({ a: 1 });
    expect(getRecord(5)).toBeUndefined();
  });

  it("firstString picks the first string-coercible value", () => {
    expect(firstString(undefined, null, 3, "x", "y")).toBe("x");
    expect(firstString(undefined, null)).toBeUndefined();
  });
});
