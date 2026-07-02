import * as http from "http";

import type { LoggerLike } from "../logging/logger";

export interface HttpServerOptions {
  /** Port to bind. Default: `process.env.PORT ?? 3000`. */
  port?: number | string;
  /** Logger for lifecycle messages. Falls back to `console`. */
  logger?: Pick<LoggerLike, "info" | "warn" | "error">;
  /**
   * Cleanup callbacks run (in order) after the HTTP server stops accepting
   * connections — e.g. `() => prisma.$disconnect()`, `() => redis.quit()`.
   */
  onShutdown?: Array<() => Promise<void> | void>;
  /** Force-exit deadline if graceful shutdown stalls. Default: `10000`. */
  shutdownTimeoutMs?: number;
  /** Signals that trigger shutdown. Default: `["SIGTERM", "SIGINT"]`. */
  signals?: NodeJS.Signals[];
  /** Called once the server is listening. */
  onListening?: (port: string) => void;
}

export interface ManagedServer {
  /** The underlying Node HTTP server. */
  server: http.Server;
  /** Start listening and register signal handlers. */
  listen(): http.Server;
  /** Run graceful shutdown manually (also invoked on signals). */
  shutdown(signal?: string): Promise<void>;
}

/**
 * Wrap an Express app in an HTTP server with graceful shutdown:
 * stop accepting connections, run cleanup callbacks, then exit — with a
 * force-exit safety timeout. Generalises the hand-rolled `server.ts` every
 * backend copies.
 */
export function createHttpServer(app: http.RequestListener, options: HttpServerOptions = {}): ManagedServer {
  const log = options.logger ?? console;
  const port = String(options.port ?? process.env.PORT ?? 3000);
  const timeoutMs = options.shutdownTimeoutMs ?? 10_000;
  const signals = options.signals ?? (["SIGTERM", "SIGINT"] as NodeJS.Signals[]);
  const server = http.createServer(app);

  let shuttingDown = false;

  async function runCleanup(): Promise<void> {
    for (const task of options.onShutdown ?? []) {
      try {
        await task();
      } catch (err) {
        log.warn("Error during shutdown cleanup", { err });
      }
    }
  }

  async function shutdown(signal = "manual"): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Shutdown signal received: ${signal}`);

    const forceExit = setTimeout(() => {
      log.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close(async () => {
      log.info("HTTP server closed");
      await runCleanup();
      clearTimeout(forceExit);
      process.exit(0);
    });
  }

  function listen(): http.Server {
    for (const signal of signals) {
      process.on(signal, () => void shutdown(signal));
    }
    return server.listen(port, () => {
      log.info(`Server listening on port ${port}`);
      options.onListening?.(port);
    });
  }

  return { server, listen, shutdown };
}
