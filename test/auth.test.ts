import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { generateToken, verifyToken } from "../src/auth/jwt";
import { createValidateToken } from "../src/auth/validate-token.middleware";
import { messagesEs } from "../src/http/messages";
import { ResponseBuilder } from "../src/http/response-builder";

const KEY = "test-secret";
const UUID = "0b81b62a-9d3e-4b3b-8f52-9a1b2c3d4e5f";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildApp(middleware: express.RequestHandler) {
  const app = express();
  app.get("/me", middleware, (req, res) => {
    res.json({ userId: req.headers.userId });
  });
  return app;
}

describe("jwt", () => {
  it("round-trips a payload", () => {
    const token = generateToken({ _id: UUID }, KEY);
    const result = verifyToken(token, KEY);
    expect(result.success).toBe(true);
    expect(result.data._id).toBe(UUID);
  });

  it("reports expiry details on expired token", () => {
    const token = generateToken({ _id: UUID }, KEY, { expiresIn: "-1s" });
    const result = verifyToken(token, KEY);
    expect(result.success).toBe(false);
    expect(result.data.expiredAt).toBeInstanceOf(Date);
  });

  it("rejects wrong key", () => {
    const token = generateToken({ _id: UUID }, KEY);
    const result = verifyToken(token, "other");
    expect(result.success).toBe(false);
  });
});

describe("createValidateToken", () => {
  const responses = new ResponseBuilder({ messages: messagesEs, environment: "test" });

  it("accepts current token shape { _id }", async () => {
    const middleware = createValidateToken({ responses, key: KEY, userIdPattern: UUID_RE });
    const token = generateToken({ _id: UUID }, KEY);
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(UUID);
  });

  it("accepts legacy token shape { user: { _id } } by default", async () => {
    const middleware = createValidateToken({ responses, key: KEY, userIdPattern: UUID_RE });
    const token = generateToken({ user: { _id: UUID } }, KEY);
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(UUID);
  });

  it("401 with EXPIRED_TOKEN text when expired", async () => {
    const middleware = createValidateToken({ responses, key: KEY });
    const token = generateToken({ _id: UUID }, KEY, { expiresIn: "-1s" });
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
    expect(res.body.error.message).toBe("Token expirado");
  });

  it("401 MISSING_TOKEN without Authorization header", async () => {
    const middleware = createValidateToken({ responses, key: KEY });
    const res = await request(buildApp(middleware)).get("/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_TOKEN");
    expect(res.body.error.message).toBe("Token de autorización requerido");
    expect(res.body.message.code).toBe("UNAUTHORIZED");
  });

  it("401 when userId fails the pattern gate", async () => {
    const middleware = createValidateToken({ responses, key: KEY, userIdPattern: UUID_RE });
    const token = generateToken({ _id: "not-a-uuid" }, KEY);
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain("re-authenticate");
  });

  it("401 misconfiguration when key resolver returns undefined", async () => {
    const middleware = createValidateToken({ responses, getKey: () => undefined });
    const token = generateToken({ _id: UUID }, KEY);
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Server misconfiguration");
  });

  it("supports custom claim extractor", async () => {
    const middleware = createValidateToken({
      responses,
      key: KEY,
      extractUserId: (payload) => (payload.sub as string | undefined),
    });
    const token = generateToken({ sub: UUID }, KEY);
    const res = await request(buildApp(middleware)).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(UUID);
  });
});
