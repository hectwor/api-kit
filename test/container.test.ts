import { describe, expect, it, vi } from "vitest";

import { createContainer, Container, ContainerError } from "../src/container/index";

describe("Container", () => {
  it("registers and resolves with type inference", () => {
    const c = createContainer()
      .value("config", { url: "db://" })
      .register("repo", (ct) => ({ url: ct.resolve("config").url }))
      .register("service", (ct) => ({ repo: ct.resolve("repo") }));

    expect(c.resolve("config").url).toBe("db://");
    expect(c.resolve("service").repo.url).toBe("db://");
  });

  it("memoizes singletons (provider runs once)", () => {
    const fn = vi.fn(() => ({ n: Math.random() }));
    const c = createContainer().register("x", fn);
    const a = c.resolve("x");
    const b = c.resolve("x");
    expect(a).toBe(b);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("transient providers run every resolve", () => {
    const fn = vi.fn(() => ({}));
    const c = createContainer().register("x", fn, { singleton: false });
    c.resolve("x");
    c.resolve("x");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("has() reports registration", () => {
    const c = createContainer().value("a", 1);
    expect(c.has("a")).toBe(true);
    expect((c as Container<{ a: number }>).has("a" as "a")).toBe(true);
  });

  it("throws on unknown token", () => {
    expect(() => createContainer().resolve("nope" as never)).toThrow(ContainerError);
  });

  it("detects circular dependencies", () => {
    const c = createContainer()
      .register("a", (ct) => ct.resolve("b" as never))
      .register("b", (ct) => ct.resolve("a" as never));
    expect(() => c.resolve("a")).toThrow(/circular/i);
  });

  it("reset() clears cached singletons", () => {
    const fn = vi.fn(() => ({}));
    const c = createContainer().register("x", fn);
    c.resolve("x");
    c.reset();
    c.resolve("x");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
