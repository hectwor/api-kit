import express from "express";
import { describe, expect, it, vi } from "vitest";

import { createHttpServer } from "../src/server/http-server";
import { runStartupTasks } from "../src/server/startup-tasks";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("runStartupTasks", () => {
  it("runs tasks sequentially and logs each", async () => {
    const order: string[] = [];
    const logger = fakeLogger();
    await runStartupTasks(
      [
        { name: "a", run: () => void order.push("a") },
        { name: "b", run: async () => void order.push("b") },
      ],
      { logger },
    );
    expect(order).toEqual(["a", "b"]);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it("non-fatal failure is logged and does not stop the rest", async () => {
    const order: string[] = [];
    const logger = fakeLogger();
    await runStartupTasks(
      [
        { name: "boom", run: () => { throw new Error("nope"); } },
        { name: "after", run: () => void order.push("after") },
      ],
      { logger },
    );
    expect(order).toEqual(["after"]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("fatal failure re-throws", async () => {
    const logger = fakeLogger();
    await expect(
      runStartupTasks([{ name: "critical", run: () => { throw new Error("db down"); }, fatal: true }], { logger }),
    ).rejects.toThrow("db down");
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("parallel mode runs all tasks", async () => {
    const seen = new Set<string>();
    await runStartupTasks(
      [
        { name: "x", run: () => void seen.add("x") },
        { name: "y", run: () => void seen.add("y") },
      ],
      { parallel: true },
    );
    expect(seen).toEqual(new Set(["x", "y"]));
  });
});

describe("createHttpServer", () => {
  it("listens, serves, and runs cleanup on manual shutdown", async () => {
    const app = express();
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    const cleanup = vi.fn();
    const logger = fakeLogger();

    const managed = createHttpServer(app, { port: 0, logger, onShutdown: [cleanup] });
    const server = managed.listen();
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));

    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    expect(await res.json()).toEqual({ ok: true });

    // Avoid the real process.exit during shutdown.
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    managed.shutdown("TEST");
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    exit.mockRestore();
  });
});
