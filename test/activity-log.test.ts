import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createActivityLogMiddleware } from "../src/modules/activity-log/activity-log.middleware";
import { ActivityLogService } from "../src/modules/activity-log/activity-log.service";
import type { ActivityLogEntity, ActivityLogRepository, LogActivityInput } from "../src/modules/activity-log/activity-log.types";
import { createActivityLogger } from "../src/modules/activity-log/activity-logger";

const UUID = "0b81b62a-9d3e-4b3b-8f52-9a1b2c3d4e5f";

function buildApp(log: (entry: LogActivityInput) => void) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers.userId = UUID;
    next();
  });
  app.use(
    createActivityLogMiddleware({
      apiPrefix: "/api/v1",
      entitiesBySegment: { account: "account", movement: "movement" },
      skipSubpaths: ["/stats", "/paginated"],
      log,
    }),
  );
  app.post("/api/v1/account", (_req, res) => res.status(201).json({ data: { id: "acc-1" } }));
  app.post("/api/v1/account/stats", (_req, res) => res.status(200).json({ data: {} }));
  app.post("/api/v1/unlisted", (_req, res) => res.status(201).json({ data: {} }));
  app.get("/api/v1/account", (_req, res) => res.status(200).json({ data: [] }));
  app.delete("/api/v1/account/fail", (_req, res) => res.status(400).json({ error: { code: "BAD" } }));
  return app;
}

function waitTick() {
  return new Promise((r) => setImmediate(r));
}

describe("createActivityLogMiddleware", () => {
  it("audits successful mutations on whitelisted segments", async () => {
    const log = vi.fn();
    await request(buildApp(log)).post("/api/v1/account").send({});
    await waitTick();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({
      userId: UUID,
      action: "CREATE",
      status: "SUCCESS",
      entityType: "account",
      entityId: "acc-1",
    });
  });

  it("skips GETs, unlisted segments and skip-subpaths", async () => {
    const log = vi.fn();
    const app = buildApp(log);
    await request(app).get("/api/v1/account");
    await request(app).post("/api/v1/unlisted").send({});
    await request(app).post("/api/v1/account/stats").send({});
    await waitTick();
    expect(log).not.toHaveBeenCalled();
  });

  it("records failures with error code", async () => {
    const log = vi.fn();
    await request(buildApp(log)).delete("/api/v1/account/fail");
    await waitTick();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({ status: "FAILED", errorCode: "BAD", entityType: "account" });
  });
});

describe("createActivityLogger", () => {
  it("is fire-and-forget: repository failures never throw", async () => {
    const repo: ActivityLogRepository = {
      create: () => Promise.reject(new Error("db down")),
      findByUserPaginated: () => Promise.resolve([]),
      deleteOlderThan: () => Promise.resolve(0),
    };
    const warn = vi.fn();
    const log = createActivityLogger(new ActivityLogService(repo), { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() });
    expect(() => log({ action: "CREATE" })).not.toThrow();
    await waitTick();
    await waitTick();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("defaults status to SUCCESS", async () => {
    const created: ActivityLogEntity[] = [];
    const repo: ActivityLogRepository = {
      create: (e) => {
        created.push(e);
        return Promise.resolve(e);
      },
      findByUserPaginated: () => Promise.resolve([]),
      deleteOlderThan: () => Promise.resolve(0),
    };
    const log = createActivityLogger(new ActivityLogService(repo));
    log({ action: "CREATE", userId: UUID });
    await waitTick();
    expect(created[0].status).toBe("SUCCESS");
  });
});
