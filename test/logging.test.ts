import { describe, expect, it } from "vitest";

import { createLogger } from "../src/logging/logger";
import { requestContextStorage, getRequestId } from "../src/logging/request-context";

describe("createLogger", () => {
  it("creates a JSON logger by default", () => {
    const log = createLogger({ service: "svc" });
    expect(typeof log.info).toBe("function");
    expect(log.level).toBe("info");
  });
  it("uses debug level when pretty", () => {
    expect(createLogger({ service: "svc", pretty: true }).level).toBe("debug");
  });
  it("honours an explicit level", () => {
    expect(createLogger({ service: "svc", level: "warn" }).level).toBe("warn");
  });
});

describe("request-context correlation", () => {
  it("returns undefined outside any context", () => {
    expect(getRequestId()).toBeUndefined();
  });
  it("exposes the requestId inside a run scope", () => {
    requestContextStorage.run({ requestId: "req-123" }, () => {
      expect(getRequestId()).toBe("req-123");
    });
  });
});
