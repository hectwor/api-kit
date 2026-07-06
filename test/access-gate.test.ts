import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAccessGate } from "../src/auth/access-gate";
import { createRequireUserId } from "../src/auth/request-user";
import { createErrorMiddleware } from "../src/middleware/error.middleware";
import { messagesEn } from "../src/http/messages";
import { ResponseBuilder } from "../src/http/response-builder";
import { BusinessError } from "../src/errors";

const requireUserId = createRequireUserId(messagesEn);
const responses = new ResponseBuilder({ messages: messagesEn });
const errors = createErrorMiddleware({ logger: { info() {}, warn() {}, error() {}, debug() {} }, responses });

function buildApp(gateMw: express.RequestHandler) {
  const app = express();
  app.use((req, _res, next) => {
    const uid = req.header("x-user");
    if (uid) req.headers.userId = uid;
    next();
  });
  app.get("/protected", gateMw, (_req, res) => res.json({ ok: true }));
  app.use(errors.handleNotFound);
  app.use(errors.handleError);
  return app;
}

describe("createAccessGate", () => {
  it("calls next() and reaches the handler when check() resolves true", async () => {
    const gate = createAccessGate<string>({ requireUserId, check: async () => true });
    const app = buildApp(gate("FEATURE_X"));
    const res = await request(app).get("/protected").set("x-user", "u1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("responds 401 via requireUserId when there is no userId, without calling check()", async () => {
    let called = false;
    const gate = createAccessGate<string>({ requireUserId, check: async () => { called = true; return true; } });
    const app = buildApp(gate("FEATURE_X"));
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });

  it("denies with a generic 403 ForbiddenError by default", async () => {
    const gate = createAccessGate<string>({ requireUserId, check: async () => false });
    const app = buildApp(gate("FEATURE_X"));
    const res = await request(app).get("/protected").set("x-user", "u1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("uses a custom onDenied error, preserving its exact shape", async () => {
    class MyDeniedError extends BusinessError {
      constructor(userId: string, feature: string) {
        super(`User ${userId} lacks "${feature}"`, 403, "CUSTOM_DENIED", "CUSTOM_DENIED", { userId, feature });
      }
    }
    const gate = createAccessGate<string>({
      requireUserId,
      check: async () => false,
      onDenied: (userId, feature) => new MyDeniedError(userId, feature),
    });
    const app = buildApp(gate("AI_CHAT"));
    const res = await request(app).get("/protected").set("x-user", "u1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CUSTOM_DENIED");
    expect(res.body.error.message).toContain('lacks "AI_CHAT"');
  });

  it("forwards an error thrown inside check() to the error middleware instead of denying silently", async () => {
    const gate = createAccessGate<string>({
      requireUserId,
      check: async () => {
        throw new Error("db unreachable");
      },
    });
    const app = buildApp(gate("FEATURE_X"));
    const res = await request(app).get("/protected").set("x-user", "u1");
    expect(res.status).toBe(500);
  });

  it("passes the concrete requirement and the request through to check()", async () => {
    const seen: Array<{ userId: string; requirement: string; path: string }> = [];
    const gate = createAccessGate<string>({
      requireUserId,
      check: async (userId, requirement, req) => {
        seen.push({ userId, requirement, path: req.path });
        return true;
      },
    });
    const app = buildApp(gate("BUDGET_PLANNING"));
    await request(app).get("/protected").set("x-user", "u42");
    expect(seen).toEqual([{ userId: "u42", requirement: "BUDGET_PLANNING", path: "/protected" }]);
  });
});
