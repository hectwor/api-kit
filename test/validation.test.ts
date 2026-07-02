import express from "express";
import Joi from "joi";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { messagesEs } from "../src/http/messages";
import { ResponseBuilder } from "../src/http/response-builder";
import { createSchemaValidator } from "../src/validation/schema-validator";

const schema = Joi.object({
  name: Joi.string().required(),
  age: Joi.number().integer().min(0),
});

function buildApp() {
  const responses = new ResponseBuilder({ messages: messagesEs, environment: "test" });
  const validateSchema = createSchemaValidator({ responses });
  const app = express();
  app.use(express.json());
  app.post("/users", validateSchema(schema), (req, res) => {
    res.json({ data: req.body });
  });
  return app;
}

describe("createSchemaValidator", () => {
  it("passes valid bodies through (with coercion)", async () => {
    const res = await request(buildApp()).post("/users").send({ name: "Ana", age: "30" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ name: "Ana", age: 30 });
  });

  it("responds 400 with prefixed joined messages", async () => {
    const res = await request(buildApp()).post("/users").send({ age: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(res.body.error.message).toMatch(/^Error de validación: /);
    expect(res.body.error.message).toContain("name");
    expect(res.body.error.message).toContain("age");
  });
});
