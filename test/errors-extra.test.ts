import { describe, expect, it } from "vitest";

import {
  ResourceError,
  ResourceNotFoundError,
  ResourceAlreadyExistsError,
  ResourceValidationError,
  InvalidResourceOperationError,
  ResourceOperationError,
} from "../src/errors/resource.error";
import {
  AuthError,
  InvalidTokenError,
  MissingTokenError,
  ExpiredTokenError,
  UnauthorizedOperationError,
} from "../src/errors/auth.error";

describe("resource errors", () => {
  it("ResourceNotFoundError → 404 with typed code", () => {
    const e = new ResourceNotFoundError("Bank", "b1");
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe("BANK_NOT_FOUND");
    expect(e.details).toMatchObject({ resourceType: "Bank", resourceId: "b1" });
  });
  it("ResourceAlreadyExistsError → 409", () => {
    expect(new ResourceAlreadyExistsError("Bank", "shortName=x").statusCode).toBe(409);
  });
  it("ResourceValidationError → 400 with field", () => {
    const e = new ResourceValidationError("Bank", "bad", "name");
    expect(e.statusCode).toBe(400);
    expect(e.details).toMatchObject({ field: "name" });
  });
  it("InvalidResourceOperationError → 400", () => {
    expect(new InvalidResourceOperationError("Bank", "create", "no user").statusCode).toBe(400);
  });
  it("ResourceOperationError → 500 wrapping original", () => {
    const e = new ResourceOperationError("Bank", "update", "boom", new Error("orig"));
    expect(e.statusCode).toBe(500);
    expect(e.details).toMatchObject({ originalError: "orig" });
  });
  it("base ResourceError defaults", () => {
    expect(new ResourceError("x").statusCode).toBe(500);
  });
});

describe("auth errors", () => {
  it("subclasses carry the right status/code", () => {
    expect(new AuthError("x")).toBeInstanceOf(Error);
    expect(new InvalidTokenError().statusCode).toBe(401);
    expect(new InvalidTokenError().code).toBe("INVALID_TOKEN");
    expect(new MissingTokenError().code).toBe("MISSING_TOKEN");
    expect(new ExpiredTokenError().code).toBe("EXPIRED_TOKEN");
    const op = new UnauthorizedOperationError();
    expect(op.statusCode).toBe(403);
  });
});
