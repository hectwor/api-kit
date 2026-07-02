/**
 * Storage abstractions so the framework never depends on a concrete client.
 */

/**
 * Structural subset of an ioredis client used by the framework.
 * Any client exposing these methods works (ioredis, node-redis adapter, etc.).
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  call(command: string, ...args: (string | number | Buffer)[]): Promise<unknown>;
}

/**
 * Minimal key-value store with TTL. Used by idempotency and any TTL cache.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * In-memory KeyValueStore. Single-process only — for local dev and tests.
 */
export function memoryStore(): KeyValueStore {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return Promise.resolve(null);
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(entry.value);
    },
    set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return Promise.resolve();
    },
  };
}

/**
 * KeyValueStore backed by a Redis-compatible client.
 */
export function redisKeyValueStore(redis: RedisLike): KeyValueStore {
  return {
    get: (key) => redis.get(key),
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, "EX", ttlSeconds);
    },
  };
}
