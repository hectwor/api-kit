import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { messagesEs } from "../src/http/messages";
import { ResponseBuilder } from "../src/http/response-builder";

function buildApp(responses: ResponseBuilder) {
  const app = express();
  app.get("/ok", (_req, res) => {
    res.locals.requestStartTime = Date.now() - 5;
    responses.sendSuccess(res, { id: "1" }, "RESOURCE_RETRIEVED", "Recurso obtenido exitosamente", 200);
  });
  app.get("/fail", (_req, res) => {
    responses.sendError(res, "NOT_FOUND", "Recurso no encontrado", 404, { hint: "x" }, "NOT_FOUND", "Recurso no encontrado");
  });
  return app;
}

describe("ResponseBuilder", () => {
  it("success envelope has exact shape (golden)", async () => {
    const responses = new ResponseBuilder({ version: "1.0", environment: "test" });
    const res = await request(buildApp(responses)).get("/ok").set("x-request-id", "req-123");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["data", "message", "metadata"]);
    expect(res.body.message).toEqual({ code: "RESOURCE_RETRIEVED", text: "Recurso obtenido exitosamente" });
    expect(res.body.data).toEqual({ id: "1" });

    const meta = res.body.metadata;
    expect(meta.version).toBe("1.0");
    expect(meta.statusCode).toBe(200);
    expect(meta.requestId).toBe("req-123");
    expect(meta.path).toBe("/ok");
    expect(meta.method).toBe("GET");
    expect(meta.environment).toBe("test");
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.duration).toMatch(/^\d+ms$/);
  });

  it("error envelope has exact shape (golden)", async () => {
    const responses = new ResponseBuilder({ environment: "test" });
    const res = await request(buildApp(responses)).get("/fail");

    expect(res.status).toBe(404);
    expect(Object.keys(res.body).sort()).toEqual(["error", "message", "metadata"]);
    expect(res.body.error).toEqual({ code: "NOT_FOUND", message: "Recurso no encontrado", details: { hint: "x" } });
    expect(res.body.message).toEqual({ code: "NOT_FOUND", text: "Recurso no encontrado" });
    expect(res.body.metadata.statusCode).toBe(404);
    // no x-request-id header -> generated id
    expect(res.body.metadata.requestId).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it("default error text comes from catalog", async () => {
    const responses = new ResponseBuilder({ messages: messagesEs });
    const app = express();
    app.get("/e", (_req, res) => {
      responses.sendError(res, "X", "boom", 400);
    });
    const res = await request(app).get("/e");
    expect(res.body.message).toEqual({ code: "ERROR", text: "An error occurred" });
  });

  it("two builders in one process do not share config", () => {
    const a = new ResponseBuilder({ version: "1.0", environment: "a" });
    const b = new ResponseBuilder({ version: "2.0", environment: "b" });
    expect(a).not.toBe(b);
    // build() via fake req/res
    const req = { headers: {}, path: "/p", method: "GET" } as unknown as express.Request;
    const res = { locals: {} } as unknown as express.Response;
    expect(a.success(req, res, null, "C", "T").metadata.version).toBe("1.0");
    expect(b.success(req, res, null, "C", "T").metadata.version).toBe("2.0");
  });
});
