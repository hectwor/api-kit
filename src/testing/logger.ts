import type { LoggerLike } from "../logging/logger";

export interface SpyLogger extends LoggerLike {
  /** All log calls captured, in order. */
  entries: Array<{ level: "info" | "warn" | "error" | "debug"; message: string; meta?: Record<string, unknown> }>;
  /** Clear captured entries. */
  reset(): void;
}

/** A logger that swallows everything — keeps test output clean. */
export function silentLogger(): LoggerLike {
  const noop = () => undefined;
  return { info: noop, warn: noop, error: noop, debug: noop };
}

/** A logger that records every call so tests can assert on what was logged. */
export function spyLogger(): SpyLogger {
  const entries: SpyLogger["entries"] = [];
  const make =
    (level: "info" | "warn" | "error" | "debug") =>
    (message: string, meta?: Record<string, unknown>) => {
      entries.push({ level, message, meta });
      return undefined;
    };
  return {
    entries,
    reset: () => void (entries.length = 0),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    debug: make("debug"),
  };
}
