import { describe, expect, it, vi } from "vitest";

import { memoryStore, redisKeyValueStore, type RedisLike } from "../src/middleware/kv-store";

describe("memoryStore", () => {
  it("stores and retrieves within TTL", async () => {
    const s = memoryStore();
    await s.set("k", "v", 60);
    expect(await s.get("k")).toBe("v");
  });
  it("returns null for missing keys", async () => {
    expect(await memoryStore().get("nope")).toBeNull();
  });
  it("expires entries past TTL", async () => {
    vi.useFakeTimers();
    const s = memoryStore();
    await s.set("k", "v", 1);
    vi.advanceTimersByTime(1500);
    expect(await s.get("k")).toBeNull();
    vi.useRealTimers();
  });
});

describe("redisKeyValueStore", () => {
  it("delegates get/set to the redis client with EX ttl", async () => {
    const redis: RedisLike = {
      get: vi.fn(() => Promise.resolve("stored")),
      set: vi.fn(() => Promise.resolve("OK")),
      call: vi.fn(() => Promise.resolve(null)),
    };
    const s = redisKeyValueStore(redis);
    expect(await s.get("k")).toBe("stored");
    await s.set("k", "v", 30);
    expect(redis.set).toHaveBeenCalledWith("k", "v", "EX", 30);
  });
});
