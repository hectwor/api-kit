import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { idempotencyMiddleware } from "../src/middleware/idempotency.middleware";
import { memoryStore } from "../src/middleware/kv-store";

function buildApp() {
  const store = memoryStore();
  const app = express();
  let counter = 0;
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers.userId = "user-1";
    next();
  });
  app.post("/things", idempotencyMiddleware(store), (_req, res) => {
    counter += 1;
    res.status(201).json({ data: { id: `thing-${counter}` } });
  });
  return { app, getCounter: () => counter };
}

describe("idempotencyMiddleware", () => {
  it("replays the cached response for the same key", async () => {
    const { app, getCounter } = buildApp();
    const first = await request(app).post("/things").set("Idempotency-Key", "k1").send({});
    const second = await request(app).post("/things").set("Idempotency-Key", "k1").send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(getCounter()).toBe(1);
  });

  it("different keys execute separately", async () => {
    const { app, getCounter } = buildApp();
    await request(app).post("/things").set("Idempotency-Key", "a").send({});
    await request(app).post("/things").set("Idempotency-Key", "b").send({});
    expect(getCounter()).toBe(2);
  });

  it("no key -> no caching", async () => {
    const { app, getCounter } = buildApp();
    await request(app).post("/things").send({});
    await request(app).post("/things").send({});
    expect(getCounter()).toBe(2);
  });
});

describe("memoryStore", () => {
  it("expires entries after ttl", async () => {
    const store = memoryStore();
    await store.set("k", "v", 0);
    await new Promise((r) => setTimeout(r, 5));
    expect(await store.get("k")).toBeNull();
  });
});
