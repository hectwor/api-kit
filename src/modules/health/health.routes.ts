import type express from "express";

import type { LoggerLike } from "../../logging/logger";
import type { CaptureException } from "../../middleware/error.middleware";
import { patchAsyncRouteHandlers } from "../../routes/async-handler";
import type { AppOrRouter } from "../../routes/routes-config";

export interface HealthRoutesOptions {
  /**
   * Named readiness checks — each must resolve for `/ready` to return 200.
   * Example: `{ db: () => prisma.$queryRaw\`SELECT 1\` }`
   */
  checks?: Record<string, () => Promise<unknown>>;
  logger?: LoggerLike;
  /** Enable GET /debug/error, which throws a test error (verify your APM captures it). */
  debug?: {
    enabled: boolean;
    captureException?: CaptureException;
  };
}

/**
 * Register liveness (`/health`), readiness (`/ready`) and optional debug routes.
 * Mount on the app directly (outside rate limiting) so load balancers and
 * monitoring can probe without consuming quota.
 */
export function createHealthRoutes(app: AppOrRouter, options: HealthRoutesOptions = {}): AppOrRouter {
  patchAsyncRouteHandlers(app);

  const checks = options.checks ?? {};
  const logger = options.logger;

  // GET /health — liveness: process is up
  app.route("/health").get((_req: express.Request, res: express.Response) => {
    res.status(200).json({ status: "ok" });
  });

  // GET /ready — readiness: every registered dependency is reachable
  app.route("/ready").get(async (_req: express.Request, res: express.Response) => {
    const results: Record<string, string> = {};
    let healthy = true;

    for (const [name, check] of Object.entries(checks)) {
      try {
        await check();
        results[name] = "ok";
      } catch (err) {
        healthy = false;
        results[name] = "unreachable";
        logger?.error("Readiness check failed", { check: name, err });
      }
    }

    res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "error", ...results });
  });

  // GET /debug/error — throws a test error so you can verify your APM captures it.
  if (options.debug?.enabled) {
    app.route("/debug/error").get((_req: express.Request, _res: express.Response) => {
      const err = new Error("Debug test — intentional error");
      options.debug?.captureException?.(err, {});
      throw err;
    });
  }

  return app;
}
