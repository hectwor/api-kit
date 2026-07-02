import express from "express";
import Joi from "joi";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  OpenApiRegistry,
  joiToOpenApi,
  collectExpressRoutes,
  createOpenApiRoutes,
  documentCrudResource,
} from "../src/openapi/index";

describe("joiToOpenApi", () => {
  it("converts a DTO schema with types, formats, enums, required", () => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      age: Joi.number().integer().min(0).max(120),
      role: Joi.string().valid("admin", "user").required(),
      active: Joi.boolean().default(true),
      tags: Joi.array().items(Joi.string()),
      nickname: Joi.string().allow(null),
    });

    const out = joiToOpenApi(schema);
    expect(out.type).toBe("object");
    expect(out.required?.sort()).toEqual(["email", "role"]);
    expect(out.properties?.email).toMatchObject({ type: "string", format: "email" });
    expect(out.properties?.age).toMatchObject({ type: "integer", minimum: 0, maximum: 120 });
    expect(out.properties?.role).toMatchObject({ type: "string", enum: ["admin", "user"] });
    expect(out.properties?.active).toMatchObject({ type: "boolean", default: true });
    expect(out.properties?.tags).toMatchObject({ type: "array", items: { type: "string" } });
    expect(out.properties?.nickname).toMatchObject({ nullable: true });
  });
});

describe("OpenApiRegistry", () => {
  it("builds a valid 3.0 document with schemas, paths and security", () => {
    const registry = new OpenApiRegistry({ title: "Test API", version: "1.2.3" });
    registry.addSchema("Bank", Joi.object({ name: Joi.string().required() }));
    registry.enableBearerAuth();
    registry.addPath({
      method: "post",
      path: "/api/v1/banks",
      tags: ["Banks"],
      requestBody: "Bank",
      security: true,
      responses: { "201": { description: "created", schema: "Bank" } },
    });

    const doc = registry.build() as any;
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info.title).toBe("Test API");
    expect(doc.components.schemas.Bank.properties.name.type).toBe("string");
    expect(doc.paths["/api/v1/banks"].post.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/Bank");
    expect(doc.paths["/api/v1/banks"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("normalises :param to {param}", () => {
    const registry = new OpenApiRegistry({ title: "t", version: "1" });
    registry.addPath({ method: "get", path: "/banks/:id" });
    const doc = registry.build() as any;
    expect(Object.keys(doc.paths)).toContain("/banks/{id}");
  });
});

describe("documentCrudResource", () => {
  it("emits the 5 standard operations from Joi schemas", () => {
    const registry = new OpenApiRegistry({ title: "t", version: "1" });
    documentCrudResource({
      registry,
      basePath: "/api/v1/banks",
      tag: "Banks",
      dtoName: "Bank",
      createSchema: Joi.object({ name: Joi.string().required() }),
      updateSchema: Joi.object({ name: Joi.string() }),
    });
    const doc = registry.build() as any;
    expect(Object.keys(doc.paths["/api/v1/banks"]).sort()).toEqual(["get", "post"]);
    expect(Object.keys(doc.paths["/api/v1/banks/{id}"]).sort()).toEqual(["delete", "get", "put"]);
    expect(doc.components.schemas.BankCreate.required).toEqual(["name"]);
    expect(doc.paths["/api/v1/banks"].post.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/BankCreate");
  });
});

describe("collectExpressRoutes", () => {
  it("discovers routes including mounted sub-routers", () => {
    const app = express();
    const router = express.Router();
    router.get("/banks", (_req, res) => res.end());
    router.post("/banks/:id", (_req, res) => res.end());
    app.use("/api/v1", router);
    app.get("/health", (_req, res) => res.end());

    const routes = collectExpressRoutes(app);
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("get /health");
    expect(paths).toContain("get /api/v1/banks");
    expect(paths).toContain("post /api/v1/banks/:id");
  });
});

describe("createOpenApiRoutes (live)", () => {
  it("serves the document in real time and reflects introspected routes", async () => {
    const app = express();
    const registry = new OpenApiRegistry({ title: "Live", version: "9" });
    app.get("/orders", (_req, res) => res.end());
    createOpenApiRoutes(app, { registry, introspect: app });

    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    // The /orders route was not explicitly documented but appears via introspection.
    expect(res.body.paths["/orders"]?.get).toBeDefined();
    // The docs/json routes themselves are ignored.
    expect(res.body.paths["/openapi.json"]).toBeUndefined();

    const html = await request(app).get("/docs");
    expect(html.status).toBe(200);
    expect(html.text).toContain("swagger-ui");
  });
});
