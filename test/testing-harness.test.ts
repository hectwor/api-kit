import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

import {
  createTestKit,
  silentLogger,
  spyLogger,
  issueUserToken,
  issueTestToken,
  bearer,
  InMemoryCrudRepository,
  createMemoryDelegate,
} from "../src/testing/index";
import { verifyToken } from "../src/auth/jwt";
import { CrudService, SoftDeleteUserScopedRepository, createCrudController, registerCrudRoutes, type RowMapper } from "../src/crud/index";

interface Widget { id?: string; userId?: string; status?: string; name?: string; color?: string }

describe("silentLogger / spyLogger", () => {
  it("silentLogger swallows and returns undefined", () => {
    const log = silentLogger();
    expect(log.info("x")).toBeUndefined();
    expect(log.error("y", { a: 1 })).toBeUndefined();
  });

  it("spyLogger records entries and resets", () => {
    const log = spyLogger();
    log.info("hi", { n: 1 });
    log.warn("careful");
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0]).toMatchObject({ level: "info", message: "hi", meta: { n: 1 } });
    log.reset();
    expect(log.entries).toHaveLength(0);
  });
});

describe("createTestKit", () => {
  it("builds a usable kit with a silent logger by default", () => {
    const kit = createTestKit();
    expect(kit.responses).toBeDefined();
    expect(kit.requireUserId).toBeDefined();
  });

  it("honours overrides (custom logger)", () => {
    const log = spyLogger();
    const kit = createTestKit({ logger: log });
    kit.logger.info("hello");
    expect(log.entries[0].message).toBe("hello");
  });
});

describe("token helpers", () => {
  it("issueUserToken signs a { _id } token verifiable with the same key", () => {
    const token = issueUserToken("u1");
    const res = verifyToken(token, "test-secret");
    expect(res.success).toBe(true);
    expect(res.data._id).toBe("u1");
  });

  it("issueTestToken accepts custom payload and key", () => {
    const token = issueTestToken({ role: "admin" }, "k");
    expect(verifyToken(token, "k").data.role).toBe("admin");
  });

  it("bearer builds the Authorization header", () => {
    expect(bearer("abc")).toEqual({ Authorization: "Bearer abc" });
  });
});

describe("InMemoryCrudRepository", () => {
  let repo: InMemoryCrudRepository<Widget>;
  beforeEach(() => (repo = new InMemoryCrudRepository<Widget>([], { searchFields: ["name"] })));

  it("scopes by user and applies soft delete", async () => {
    const a = await repo.create({ userId: "u1", name: "a", status: "active" });
    await repo.create({ userId: "u2", name: "b", status: "active" });
    expect(await repo.findAllByUserId("u1")).toHaveLength(1);
    expect(await repo.findByIdAndUserId(a.id!, "u2")).toBeNull();
    await repo.remove(a.id!);
    expect(await repo.findAllByUserId("u1")).toHaveLength(0);
  });

  it("applies filters, search and sort", async () => {
    await repo.create({ userId: "u1", name: "alpha", color: "red", status: "active" });
    await repo.create({ userId: "u1", name: "beta", color: "blue", status: "active" });
    await repo.create({ userId: "u1", name: "gamma", color: "red", status: "active" });

    expect(await repo.findAllByUserId("u1", { filters: { color: "red" } })).toHaveLength(2);
    expect(await repo.findAllByUserId("u1", { search: "bet" })).toHaveLength(1);
    const sorted = await repo.findAllByUserId("u1", { sort: { field: "name", dir: "desc" } });
    expect(sorted.map((w) => w.name)).toEqual(["gamma", "beta", "alpha"]);

    const page = await repo.findPaginatedByUserId("u1", 1, 2, { sort: { field: "name", dir: "asc" } });
    expect(page.total).toBe(3);
    expect(page.items.map((w) => w.name)).toEqual(["alpha", "beta"]);
  });
});

describe("createMemoryDelegate + SoftDeleteUserScopedRepository (filters end-to-end)", () => {
  const mapper: RowMapper<Widget> = {
    toDomain: (r) => ({ id: r.id as string, userId: r.user_id as string, status: r.status as string, name: r.name as string, color: r.color as string }),
    toCreateInput: (w) => ({ id: w.id, user_id: w.userId, status: w.status ?? "active", name: w.name, color: w.color }),
    toUpdateInput: (w) => ({ ...(w.name !== undefined && { name: w.name }) }),
  };

  it("filters, searches and sorts through the real repository via the memory delegate", async () => {
    const delegate = createMemoryDelegate();
    const repo = new SoftDeleteUserScopedRepository<Widget>({
      delegate,
      mapper,
      columnMap: { name: "name", color: "color" },
      searchColumns: ["name"],
    });
    await repo.create({ userId: "u1", name: "alpha", color: "red" });
    await repo.create({ userId: "u1", name: "beta", color: "blue" });
    await repo.create({ userId: "u1", name: "gamma", color: "red" });

    expect(await repo.findAllByUserId("u1", { filters: { color: "red" } })).toHaveLength(2);
    expect(await repo.findAllByUserId("u1", { search: "amm" })).toHaveLength(1);
    const page = await repo.findPaginatedByUserId("u1", 1, 10, { sort: { field: "name", dir: "desc" } });
    expect(page.items.map((w) => w.name)).toEqual(["gamma", "beta", "alpha"]);
  });
});

describe("full CRUD HTTP with test harness (filters over HTTP)", () => {
  function buildApp() {
    const kit = createTestKit();
    const repo = new InMemoryCrudRepository<Widget>([], { searchFields: ["name"] });
    const service = new CrudService<Widget>(repo);
    const controller = createCrudController<Widget>({
      resource: "Widget",
      service,
      responses: kit.responses,
      requireUserId: kit.requireUserId,
      listQuery: { allowedFilters: ["color"], allowedSort: ["name"], searchParam: "q" },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.headers.userId = req.header("x-user") ?? ""; next(); });
    registerCrudRoutes(app, { basePath: "/widgets", controller, enablePaginated: true });
    return app;
  }

  it("honours filter and sort query params over HTTP", async () => {
    const app = buildApp();
    for (const [name, color] of [["a", "red"], ["b", "blue"], ["c", "red"]]) {
      await request(app).post("/widgets").set("x-user", "u1").send({ name, color });
    }
    const filtered = await request(app).get("/widgets?color=red").set("x-user", "u1");
    expect(filtered.body.data).toHaveLength(2);

    const sorted = await request(app).get("/widgets?sort=name:desc").set("x-user", "u1");
    expect(sorted.body.data.map((w: Widget) => w.name)).toEqual(["c", "b", "a"]);

    const paged = await request(app).get("/widgets/paginated?limit=2&sort=name:asc").set("x-user", "u1");
    expect(paged.body.data.pagination.total).toBe(3);
    expect(paged.body.data.items).toHaveLength(2);
  });
});
