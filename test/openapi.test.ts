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
import { createTestKit } from "../src/testing/index";

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

describe("joiToOpenApi (extended types)", () => {
  it("maps dates, uri/uuid formats, arrays with bounds, and descriptions", () => {
    const schema = Joi.object({
      when: Joi.date(),
      link: Joi.string().uri(),
      ref: Joi.string().guid(),
      code: Joi.string().min(2).max(5).description("a code"),
      exact: Joi.string().length(4),
      scores: Joi.array().items(Joi.number()).min(1).max(3),
      count: Joi.number(),
    });
    const out = joiToOpenApi(schema);
    expect(out.properties?.when).toMatchObject({ type: "string", format: "date-time" });
    expect(out.properties?.link).toMatchObject({ format: "uri" });
    expect(out.properties?.ref).toMatchObject({ format: "uuid" });
    expect(out.properties?.code).toMatchObject({ minLength: 2, maxLength: 5, description: "a code" });
    expect(out.properties?.exact).toMatchObject({ minLength: 4, maxLength: 4 });
    expect(out.properties?.scores).toMatchObject({ type: "array", minItems: 1, maxItems: 3 });
    expect(out.properties?.count).toMatchObject({ type: "number" });
  });

  it("maps alternatives to oneOf", () => {
    const out = joiToOpenApi(Joi.alternatives(Joi.string(), Joi.number()));
    expect(out.oneOf?.length).toBe(2);
  });

  it("handles a bare/any schema", () => {
    expect(joiToOpenApi(Joi.any())).toEqual({});
  });
});

describe("documentCrudResource (variants)", () => {
  it("adds paginated route and bearer security, omits bodies when no schemas", () => {
    const registry = new OpenApiRegistry({ title: "t", version: "1" });
    documentCrudResource({ registry, basePath: "/x", tag: "X", dtoName: "X", paginated: true, secured: true });
    const doc = registry.build() as any;
    expect(doc.paths["/x/paginated"].get).toBeDefined();
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();
    // no createSchema → no requestBody on POST
    expect(doc.paths["/x"].post.requestBody).toBeUndefined();
  });

  it("registers the response DTO schema when provided", () => {
    const registry = new OpenApiRegistry({ title: "t", version: "1" });
    documentCrudResource({
      registry,
      basePath: "/x",
      tag: "X",
      dtoName: "X",
      responseSchema: Joi.object({ id: Joi.string() }),
      secured: false,
    });
    const doc = registry.build() as any;
    expect(doc.components.schemas.X).toBeDefined();
    expect(doc.paths["/x/{id}"].get.responses["200"].content).toBeDefined();
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

describe("createOpenApiRoutes auto-documents non-CRUD routes from validateSchema", () => {
  it("derives the request body of a tagged POST route", async () => {
    const kit = createTestKit();
    const app = express();
    app.use(express.json());
    const LoginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });
    app.post("/auth/login", kit.validateSchema(LoginSchema), (_req, res) => res.json({ ok: true }));

    const registry = new OpenApiRegistry({ title: "Auth", version: "1" });
    createOpenApiRoutes(app, { registry, introspect: app });

    const res = await request(app).get("/openapi.json");
    const op = res.body.paths["/auth/login"].post;
    expect(op).toBeDefined();
    const body = op.requestBody.content["application/json"].schema;
    expect(body.type).toBe("object");
    expect(body.properties.email).toMatchObject({ type: "string", format: "email" });
    expect(body.required).toEqual(expect.arrayContaining(["email", "password"]));
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
