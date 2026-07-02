import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { BusinessError } from "../src/errors/business.error";
import { messagesEs } from "../src/http/messages";
import { ResponseBuilder } from "../src/http/response-builder";
import { createErrorMiddleware } from "../src/middleware/error.middleware";

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function buildApp(opts: { captureException?: ReturnType<typeof vi.fn> } = {}) {
  const responses = new ResponseBuilder({ messages: messagesEs, environment: "test" });
  const errors = createErrorMiddleware({ logger: silentLogger, responses, captureException: opts.captureException });

  const app = express();
  app.get("/business", (_req, _res, next) => next(new BusinessError("regla violada", 400, "MY_RULE", "BUSINESS_RULE_VIOLATION")));
  app.get("/joi", (_req, _res, next) => {
    const err = new Error("joi failed") as Error & { details?: unknown };
    err.name = "ValidationError";
    err.details = [{ message: "campo requerido" }];
    next(err);
  });
  app.get("/prisma-dup", (_req, _res, next) => {
    const err = new Error("unique") as Error & { code?: string; meta?: unknown };
    err.code = "P2002";
    err.meta = { target: ["email"] };
    next(err);
  });
  app.get("/prisma-missing", (_req, _res, next) => {
    const err = new Error("nf") as Error & { code?: string };
    err.code = "P2025";
    next(err);
  });
  app.get("/unknown", (_req, _res, next) => next(new Error("kaput")));
  app.use((req, res) => errors.handleNotFound(req, res));
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => errors.handleError(err, req, res, next));
  return app;
}

describe("createErrorMiddleware", () => {
  it("maps BusinessError with its own status/codes", async () => {
    const res = await request(buildApp()).get("/business");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MY_RULE");
    expect(res.body.error.message).toBe("regla violada");
    expect(res.body.message.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(res.body.message.text).toBe("Violación de regla de negocio");
  });

  it("maps Joi ValidationError to 422", async () => {
    const res = await request(buildApp()).get("/joi");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Error de validación en los datos proporcionados");
  });

  it("maps Prisma P2002 (duck-typed) to 409 with meta details", async () => {
    const res = await request(buildApp()).get("/prisma-dup");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_ENTRY");
    expect(res.body.error.details).toEqual({ target: ["email"] });
    expect(res.body.message.text).toBe("Entrada duplicada");
  });

  it("maps Prisma P2025 to 404", async () => {
    const res = await request(buildApp()).get("/prisma-missing");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("maps unknown errors to 500 and calls captureException", async () => {
    const capture = vi.fn();
    const res = await request(buildApp({ captureException: capture })).get("/unknown");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.message).toBe("Error interno del servidor");
    expect(capture).toHaveBeenCalledOnce();
  });

  it("does not call captureException for 4xx", async () => {
    const capture = vi.fn();
    await request(buildApp({ captureException: capture })).get("/business");
    expect(capture).not.toHaveBeenCalled();
  });

  it("handleNotFound responds 404 with route text", async () => {
    const res = await request(buildApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.message.text).toBe("Ruta no encontrada");
  });
});
