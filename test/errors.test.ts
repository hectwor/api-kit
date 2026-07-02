import { describe, expect, it } from "vitest";

import {
  BusinessError,
  ConflictError,
  ForbiddenError,
  InvalidTokenError,
  NotFoundError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from "../src/errors/index";

describe("BusinessError", () => {
  it("carries status, codes and details", () => {
    const err = new BusinessError("boom", 418, "TEAPOT", "INVALID_OPERATION", { a: 1 });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe("TEAPOT");
    expect(err.messageCode).toBe("INVALID_OPERATION");
    expect(err.details).toEqual({ a: 1 });
    expect(err.message).toBe("boom");
    expect(err).toBeInstanceOf(Error);
  });

  it("serializes toJSON", () => {
    const err = new BusinessError("boom", 400, "X", "Y", { z: true });
    expect(err.toJSON()).toEqual({ error: "X", message: "boom", statusCode: 400, messageCode: "Y", details: { z: true } });
  });

  it("has sane defaults", () => {
    const err = new BusinessError("oops");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("BUSINESS_ERROR");
    expect(err.messageCode).toBe("INTERNAL_ERROR");
  });
});

describe("standard subclasses", () => {
  it.each([
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "ALREADY_EXISTS"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new UnprocessableError(), 422, "VALIDATION_ERROR"],
  ])("%s maps to status %i / code %s", (err, status, code) => {
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(BusinessError);
  });
});

describe("auth/resource errors", () => {
  it("InvalidTokenError is 401", () => {
    const err = new InvalidTokenError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("INVALID_TOKEN");
  });

  it("ResourceNotFoundError builds code from resource type", () => {
    const err = new ResourceNotFoundError("account", "abc");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("ACCOUNT_NOT_FOUND");
    expect(err.details).toMatchObject({ resourceType: "account", resourceId: "abc" });
  });

  it("ResourceAlreadyExistsError is 409", () => {
    const err = new ResourceAlreadyExistsError("user", "email");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("USER_ALREADY_EXISTS");
  });
});
