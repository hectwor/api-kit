import { describe, expect, it } from "vitest";

import { parseCursor, cursorData } from "../src/http/pagination";

describe("parseCursor", () => {
  it("parses limit and cursor with defaults and caps", () => {
    expect(parseCursor({ limit: "10", cursor: "abc" })).toEqual({ limit: 10, cursor: "abc" });
    expect(parseCursor({})).toEqual({ limit: 20, cursor: undefined });
    expect(parseCursor({ limit: "9999" }, { maxLimit: 50 }).limit).toBe(50);
    expect(parseCursor({ limit: "0" }).limit).toBe(20);
  });

  it("honours a custom cursor param", () => {
    expect(parseCursor({ after: "x" }, { cursorParam: "after" }).cursor).toBe("x");
  });
});

describe("cursorData", () => {
  it("drops the extra row and emits nextCursor when there is more", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }]; // fetched limit+1 = 3 for limit 2
    const page = cursorData(rows, 2, (r) => r.id);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.pagination).toEqual({ limit: 2, nextCursor: "b", hasMore: true });
  });

  it("signals no more when rows fit within limit", () => {
    const page = cursorData([{ id: "a" }], 2, (r) => r.id);
    expect(page.items).toHaveLength(1);
    expect(page.pagination).toEqual({ limit: 2, nextCursor: null, hasMore: false });
  });

  it("handles an empty page", () => {
    const page = cursorData([], 10, (r: { id: string }) => r.id);
    expect(page.items).toEqual([]);
    expect(page.pagination.nextCursor).toBeNull();
  });
});
