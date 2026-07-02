import { describe, expect, it } from "vitest";

import { parseListQuery } from "../src/crud/list-query";

describe("parseListQuery", () => {
  const opts = { allowedFilters: ["color", "active"], allowedSort: ["name", "createdAt"], searchParam: "q" };

  it("keeps only allow-listed filters and coerces values", () => {
    const q = parseListQuery({ color: "red", active: "true", secret: "x", count: "3" }, opts);
    expect(q.filters).toEqual({ color: "red", active: true });
    expect(q.filters).not.toHaveProperty("secret");
    expect(q.filters).not.toHaveProperty("count"); // not allow-listed
  });

  it("coerces numeric and boolean filter values", () => {
    const q = parseListQuery({ color: "5", active: "false" }, { allowedFilters: ["color", "active"] });
    expect(q.filters).toEqual({ color: 5, active: false });
  });

  it("parses combined sort form name:desc", () => {
    expect(parseListQuery({ sort: "name:desc" }, opts).sort).toEqual({ field: "name", dir: "desc" });
    expect(parseListQuery({ sort: "name" }, opts).sort).toEqual({ field: "name", dir: "asc" });
  });

  it("parses split sortBy/order form", () => {
    expect(parseListQuery({ sortBy: "createdAt", order: "desc" }, opts).sort).toEqual({ field: "createdAt", dir: "desc" });
  });

  it("rejects sort field not in allow-list, falling back to default", () => {
    const def = { field: "createdAt", dir: "desc" as const };
    expect(parseListQuery({ sort: "password:asc" }, { ...opts, defaultSort: def }).sort).toEqual(def);
    expect(parseListQuery({ sort: "password:asc" }, opts).sort).toBeUndefined();
  });

  it("extracts trimmed search term", () => {
    expect(parseListQuery({ q: "  hello " }, opts).search).toBe("hello");
    expect(parseListQuery({ q: "   " }, opts).search).toBeUndefined();
  });

  it("returns empty object when nothing matches", () => {
    expect(parseListQuery({ foo: "bar" }, opts)).toEqual({});
  });

  it("ignores filters entirely when no allow-list given", () => {
    expect(parseListQuery({ color: "red" }, {}).filters).toBeUndefined();
  });
});
