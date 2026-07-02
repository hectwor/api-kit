import { describe, expect, it } from "vitest";

import {
  sanitizeString,
  decodeHtmlEntities,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeObject,
  validateAndSanitize,
} from "../src/middleware/sanitizer";

describe("sanitizeString", () => {
  it("strips script/iframe/embed/object tags and event handlers", () => {
    expect(sanitizeString('<script>alert(1)</script>hello')).toBe("hello");
    expect(sanitizeString('<iframe src="x"></iframe>a')).toContain("a");
    expect(sanitizeString('<embed src=x>')).toBe("");
    expect(sanitizeString('<object data=x>')).toBe("");
    expect(sanitizeString('<div onclick="evil()">')).not.toContain("onclick");
    expect(sanitizeString('<div onload=evil>')).not.toContain("onload");
  });

  it("encodes HTML special characters", () => {
    expect(sanitizeString("a & b")).toContain("&amp;");
    expect(sanitizeString("<b>")).toContain("&lt;");
    expect(sanitizeString('"q"')).toContain("&quot;");
    expect(sanitizeString("a/b")).toContain("&#x2F;");
  });

  it("returns non-string input untouched", () => {
    expect(sanitizeString("" as string)).toBe("");
    expect(sanitizeString(null as unknown as string)).toBeNull();
  });
});

describe("decodeHtmlEntities", () => {
  it("reverses the encoding", () => {
    expect(decodeHtmlEntities("&lt;b&gt;")).toBe("<b>");
    expect(decodeHtmlEntities("a &amp; b")).toBe("a & b");
    expect(decodeHtmlEntities("&#x2F;")).toBe("/");
  });
  it("passes through non-strings", () => {
    expect(decodeHtmlEntities(null as unknown as string)).toBeNull();
  });
});

describe("sanitizeEmail / sanitizeNumber", () => {
  it("lowercases and trims emails", () => {
    expect(sanitizeEmail("  Foo@BAR.com ")).toBe("foo@bar.com");
    expect(sanitizeEmail(undefined as unknown as string)).toBeUndefined();
  });
  it("parses numbers or returns null", () => {
    expect(sanitizeNumber("42.5")).toBe(42.5);
    expect(sanitizeNumber("abc")).toBeNull();
  });
});

describe("sanitizeObject / validateAndSanitize", () => {
  it("recursively sanitizes strings in nested objects and arrays", () => {
    const dirty = { name: "<script>x</script>bob", nested: { bio: "<b>hi" }, tags: ["<i>a"], age: 3 };
    const clean = sanitizeObject(dirty);
    expect(clean.name).toBe("bob");
    expect(clean.nested.bio).toContain("&lt;");
    expect(clean.tags[0]).toContain("&lt;");
    expect(clean.age).toBe(3);
  });
  it("passes through nullish", () => {
    expect(sanitizeObject(null as unknown as object)).toBeNull();
    expect(validateAndSanitize(null as unknown as object)).toBeNull();
    expect(validateAndSanitize({ a: "<b" }).a).toContain("&lt;");
  });
});
