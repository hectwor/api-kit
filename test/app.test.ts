import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp, finalizeApp } from "../src/app/create-app";
import { createApiKit } from "../src/kit";
import { messagesEs } from "../src/http/messages";
import { createHealthRoutes } from "../src/modules/health/health.routes";

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function buildFullApp() {
  const kit = createApiKit({
    service: "test-api",
    environment: "test",
    messages: messagesEs,
    logger: silentLogger,
  });

  const { app, apiRouter } = createApp({ kit, apiPrefix: "/api/v1", globalRateLimit: false });

  apiRouter.get("/hello", (req, res) => {
    kit.responses.sendSuccess(res, { hi: true, spoofed: req.headers.userId ?? null }, "RESOURCE_RETRIEVED", "ok");
  });
  apiRouter.get("/boom", () => {
    throw new Error("explode");
  });

  createHealthRoutes(app, { checks: { db: () => Promise.resolve() }, logger: silentLogger });

  finalizeApp(app, { errors: kit.errors });
  return app;
}

describe("createApp + finalizeApp", () => {
  it("serves routes under the api prefix with envelope + x-request-id header", async () => {
    const res = await request(buildFullApp()).get("/api/v1/hello");
    expect(res.status).toBe(200);
    expect(res.body.data.hi).toBe(true);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.body.metadata.requestId).toBe(res.headers["x-request-id"]);
  });

  it("strips client-supplied identity headers", async () => {
    const res = await request(buildFullApp()).get("/api/v1/hello").set("userId", "attacker");
    expect(res.body.data.spoofed).toBeNull();
  });

  it("404s unknown routes with the standard envelope", async () => {
    const res = await request(buildFullApp()).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.message.text).toBe("Ruta no encontrada");
  });

  it("routes thrown errors to the global handler", async () => {
    const res = await request(buildFullApp()).get("/api/v1/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("health/ready endpoints respond outside the api prefix", async () => {
    const app = buildFullApp();
    const health = await request(app).get("/health");
    const ready = await request(app).get("/ready");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ok", db: "ok" });
  });

  it("readiness reports failing checks with 503", async () => {
    const kit = createApiKit({ service: "t", logger: silentLogger });
    const { app } = createApp({ kit, globalRateLimit: false });
    createHealthRoutes(app, { checks: { db: () => Promise.reject(new Error("down")) }, logger: silentLogger });
    finalizeApp(app, { errors: kit.errors });

    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "error", db: "unreachable" });
  });

  it("global rate limit answers 429 with the standard body", async () => {
    const kit = createApiKit({ service: "t", logger: silentLogger });
    const { app, apiRouter } = createApp({ kit, globalRateLimit: { windowMs: 60_000, max: 1 } });
    apiRouter.get("/x", (_req, res) => res.json({ ok: true }));
    finalizeApp(app, { errors: kit.errors });

    await request(app).get("/api/v1/x");
    const res = await request(app).get("/api/v1/x");
    expect(res.status).toBe(429);
    expect(res.body.message.code).toBe("RATE_LIMITED");
    expect(res.body.metadata.limiter).toBe("global");
  });
});
