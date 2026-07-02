import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";

import { createApiKit } from "../src/kit";
import {
  SoftDeleteUserScopedRepository,
  CrudService,
  createCrudController,
  registerCrudRoutes,
  type ModelDelegate,
  type RowMapper,
} from "../src/crud/index";

// --- Domain under test -------------------------------------------------------

interface Widget {
  id?: string;
  userId?: string;
  status?: string;
  name?: string;
  createdBy?: string;
  updatedBy?: string;
}

type Row = Record<string, unknown>;

const mapper: RowMapper<Widget, Row> = {
  toDomain: (row) => ({
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    status: (row.status as string) ?? "active",
    name: (row.name as string) ?? undefined,
    createdBy: (row.created_by as string) ?? undefined,
    updatedBy: (row.updated_by as string) ?? undefined,
  }),
  toCreateInput: (e) => ({
    id: e.id ?? `w_${Math.random().toString(36).slice(2, 8)}`,
    user_id: e.userId,
    status: e.status ?? "active",
    name: e.name ?? "",
    created_by: e.createdBy ?? e.userId,
  }),
  toUpdateInput: (e) => ({
    ...(e.name !== undefined && { name: e.name }),
    ...(e.status !== undefined && { status: e.status }),
    ...(e.updatedBy !== undefined && { updated_by: e.updatedBy }),
  }),
};

/** Minimal in-memory Prisma-like delegate. */
function makeDelegate(): ModelDelegate<Row> & { rows: Row[] } {
  const rows: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
      return row[k] === v;
    });
  return {
    rows,
    findFirst: ({ where } = {}) => Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    findMany: ({ where, take, skip } = {}) => {
      let out = rows.filter((r) => matches(r, where));
      if (skip) out = out.slice(skip);
      if (take) out = out.slice(0, take);
      return Promise.resolve(out);
    },
    count: ({ where } = {}) => Promise.resolve(rows.filter((r) => matches(r, where)).length),
    create: ({ data }) => {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    update: ({ where, data }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    delete: ({ where }) => {
      const idx = rows.findIndex((r) => matches(r, where));
      const [removed] = rows.splice(idx, 1);
      return Promise.resolve(removed);
    },
  };
}

function buildApp() {
  const kit = createApiKit({ service: "test" });
  const delegate = makeDelegate();
  const repository = new SoftDeleteUserScopedRepository<Widget, Row>({ delegate, mapper });
  const service = new CrudService<Widget>(repository);
  const controller = createCrudController<Widget>({
    resource: "Widget",
    service,
    responses: kit.responses,
    requireUserId: kit.requireUserId,
  });

  const app = express();
  app.use(express.json());
  // Simulate the token middleware having set the userId header.
  app.use((req, _res, next) => {
    const uid = req.header("x-user");
    if (uid) req.headers.userId = uid;
    next();
  });
  registerCrudRoutes(app, { basePath: "/widgets", controller, enablePaginated: true });
  return { app, delegate, service, repository };
}

// --- Tests -------------------------------------------------------------------

describe("CrudService security guards", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => (ctx = buildApp()));

  it("all() without userId returns [] (no cross-tenant leak)", async () => {
    await ctx.service.create({ userId: "u1", name: "a" });
    expect(await ctx.service.all(undefined)).toEqual([]);
    expect(await ctx.service.all("u1")).toHaveLength(1);
  });

  it("readById() is user-scoped", async () => {
    const w = await ctx.service.create({ userId: "u1", name: "a" });
    expect(await ctx.service.readById(w.id!, "u2")).toBeNull();
    expect(await ctx.service.readById(w.id!, "u1")).not.toBeNull();
  });

  it("updateById() refuses when not owner", async () => {
    const w = await ctx.service.create({ userId: "u1", name: "a" });
    expect(await ctx.service.updateById(w.id!, { name: "x" }, "u2")).toBeNull();
    const ok = await ctx.service.updateById(w.id!, { name: "x" }, "u1");
    expect(ok?.name).toBe("x");
  });

  it("deleteById() soft-deletes and refuses non-owner", async () => {
    const w = await ctx.service.create({ userId: "u1", name: "a" });
    expect(await ctx.service.deleteById(w.id!, "u2")).toBe(false);
    expect(await ctx.service.deleteById(w.id!, "u1")).toBe(true);
    // Soft delete: row still present but flipped to deleted, no longer listed.
    expect(ctx.delegate.rows[0].status).toBe("deleted");
    expect(await ctx.service.all("u1")).toEqual([]);
  });
});

describe("CRUD HTTP surface", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => (ctx = buildApp()));

  it("401 when no user id present", async () => {
    const res = await request(ctx.app).get("/widgets");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("MISSING_USER_ID");
  });

  it("full create → get → update → delete cycle", async () => {
    const created = await request(ctx.app).post("/widgets").set("x-user", "u1").send({ name: "hello" });
    expect(created.status).toBe(201);
    expect(created.body.message.code).toBe("RESOURCE_CREATED");
    const id = created.body.data.id;

    const got = await request(ctx.app).get(`/widgets/${id}`).set("x-user", "u1");
    expect(got.status).toBe(200);
    expect(got.body.data.name).toBe("hello");
    expect(got.body.data.createdBy).toBe("u1");

    const upd = await request(ctx.app).put(`/widgets/${id}`).set("x-user", "u1").send({ name: "bye" });
    expect(upd.status).toBe(200);
    expect(upd.body.data.name).toBe("bye");

    const del = await request(ctx.app).delete(`/widgets/${id}`).set("x-user", "u1");
    expect(del.status).toBe(200);
    expect(del.body.message.code).toBe("RESOURCE_DELETED");

    const gone = await request(ctx.app).get(`/widgets/${id}`).set("x-user", "u1");
    expect(gone.status).toBe(404);
  });

  it("404 when accessing another user's resource", async () => {
    const created = await request(ctx.app).post("/widgets").set("x-user", "u1").send({ name: "hello" });
    const id = created.body.data.id;
    const res = await request(ctx.app).get(`/widgets/${id}`).set("x-user", "u2");
    expect(res.status).toBe(404);
  });

  it("paginated returns standard pagination envelope", async () => {
    for (let i = 0; i < 5; i++) {
      await request(ctx.app).post("/widgets").set("x-user", "u1").send({ name: `w${i}` });
    }
    const res = await request(ctx.app).get("/widgets/paginated?page=1&limit=2").set("x-user", "u1");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3, hasMore: true });
  });
});
