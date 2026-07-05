import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { CommonRoutesConfig, patchAsyncRouteHandlers, BaseDTO, type AppOrRouter } from "../src/routes/index";

describe("CommonRoutesConfig", () => {
  it("calls configureRoutes on construction and exposes the name", () => {
    let configured = false;
    class MyRoutes extends CommonRoutesConfig {
      constructor(app: AppOrRouter) {
        super(app, "MyRoutes");
      }
      configureRoutes() {
        configured = true;
        this.app.route("/ping").get((_req, res) => res.json({ ok: true }));
        return this.app;
      }
    }
    const app = express();
    const routes = new MyRoutes(app);
    expect(configured).toBe(true);
    expect(routes.getName()).toBe("MyRoutes");
  });
});

describe("patchAsyncRouteHandlers", () => {
  it("forwards async rejections to the error handler", async () => {
    const app = express();
    patchAsyncRouteHandlers(app);
    // Patching twice is a no-op (covers the guard).
    patchAsyncRouteHandlers(app);
    app.route("/boom").get(async () => {
      throw new Error("async fail");
    });
    let caught: string | undefined;
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      caught = err.message;
      res.status(500).json({ error: err.message });
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(caught).toBe("async fail");
  });
});

describe("patchAsyncRouteHandlers preserves handler metadata", () => {
  it("keeps own props (e.g. validateSchema's schema tag) on the wrapped handler", () => {
    const app = express();
    patchAsyncRouteHandlers(app);
    const tagged = Object.assign(((_req: express.Request, res: express.Response) => res.end()) as express.RequestHandler, {
      __apiKitSchema: { marker: true },
    });
    const route = app.route("/tagged").get(tagged) as unknown as { stack: Array<{ handle: { __apiKitSchema?: unknown } }> };
    const wrapped = route.stack.find((l) => l.handle.__apiKitSchema);
    expect(wrapped?.handle.__apiKitSchema).toEqual({ marker: true });
  });
});

describe("BaseDTO", () => {
  it("assigns provided fields", () => {
    const dto = new BaseDTO({ id: "1", createdAt: "t" });
    expect(dto.id).toBe("1");
    expect(dto.createdAt).toBe("t");
    expect(new BaseDTO().id).toBeUndefined();
  });
});
