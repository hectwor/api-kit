import { randomBytes } from "crypto";

import * as bodyparser from "body-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { HelmetOptions } from "helmet";

import type { ApiKit } from "../kit";
import type { ErrorMiddleware } from "../middleware/error.middleware";
import { makeGlobalLimiter, stripClientIdentityHeaders, type RateLimitStore } from "../middleware/rate-limit.middleware";

export interface CreateAppOptions {
  /** Configured kit (logger, responses, error middleware, etc.). */
  kit: ApiKit;
  /** Prefix the API router is mounted under. Default: "/api/v1". */
  apiPrefix?: string;
  /**
   * Prefix guarded by identity-header stripping and the global rate limiter.
   * Default: the first path segment of `apiPrefix` (e.g. "/api/").
   */
  guardPrefix?: string;
  /** Exact CORS origins and/or regexes. localhost (any port) is NOT implied — pass it if you want it. */
  corsOrigins?: (string | RegExp)[];
  /** Full CORS options override; when set, `corsOrigins` is ignored. */
  corsOptions?: cors.CorsOptions;
  /** Helmet options override. Default: helmet defaults + per-request CSP nonce available at `res.locals.nonce`. */
  helmetOptions?: HelmetOptions;
  /** Global rate limit. `false` disables it. Default: 1000 req / 15 min. */
  globalRateLimit?: { windowMs?: number; max?: number } | false;
  /** Distributed store for the global limiter (see `createRedisRateLimitStore`). */
  rateLimitStore?: RateLimitStore;
  /** body-parser JSON limit, e.g. "1mb". */
  bodyLimit?: string;
  /** Express `trust proxy` setting (needed behind load balancers for correct req.ip). */
  trustProxy?: boolean | number | string;
  /** Disable the request-logging middleware. Default: enabled. */
  requestLogging?: boolean;
  /** Disable the input-sanitization middleware. Default: enabled. */
  sanitization?: boolean;
  /** Middleware mounted on the API router before any route (e.g. activity-log auditing). */
  beforeRoutes?: express.RequestHandler[];
}

export interface CreatedApp {
  app: express.Application;
  /** Router mounted at `apiPrefix`; register your routes here. */
  apiRouter: express.Router;
}

/**
 * Assemble the standard middleware stack:
 *
 *   CSP nonce → helmet → CORS → strip identity headers → global rate limit →
 *   body parser → sanitization → request logging → apiRouter(prefix)
 *
 * Register routes on the returned `apiRouter` (and health/public routes on
 * `app`), then call `finalizeApp` to mount 404 + error handlers last.
 */
export function createApp(options: CreateAppOptions): CreatedApp {
  const { kit } = options;
  const apiPrefix = options.apiPrefix ?? "/api/v1";
  const guardPrefix = options.guardPrefix ?? `/${apiPrefix.split("/").filter(Boolean)[0] ?? "api"}/`;

  const app = express();

  if (options.trustProxy !== undefined) {
    app.set("trust proxy", options.trustProxy);
  }

  // Per-request nonce — allows safe inline scripts on self-served HTML pages.
  app.use((_req, res, next) => {
    res.locals.nonce = randomBytes(16).toString("base64");
    next();
  });

  app.use(helmet(options.helmetOptions));

  const corsOptions: cors.CorsOptions = options.corsOptions ?? {
    origin: options.corsOrigins ?? [],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    maxAge: 86400, // 24 hours
  };
  app.use(cors(corsOptions));

  // Strip client-supplied identity headers BEFORE routes run, preventing
  // bucket-key spoofing. Token validation (per-route) then sets userId from JWT.
  app.use(guardPrefix, stripClientIdentityHeaders);

  if (options.globalRateLimit !== false) {
    app.use(
      guardPrefix,
      makeGlobalLimiter({
        windowMs: options.globalRateLimit?.windowMs,
        max: options.globalRateLimit?.max,
        store: options.rateLimitStore,
      }),
    );
  }

  app.use(bodyparser.json(options.bodyLimit ? { limit: options.bodyLimit } : {}));

  if (options.sanitization !== false) {
    app.use(kit.sanitization);
  }

  if (options.requestLogging !== false) {
    app.use(kit.requestLogging);
  }

  const apiRouter = express.Router();
  for (const middleware of options.beforeRoutes ?? []) {
    apiRouter.use(middleware);
  }
  app.use(apiPrefix, apiRouter);

  return { app, apiRouter };
}

export interface FinalizeAppOptions {
  errors: ErrorMiddleware;
  /** Hook that runs right before the error handler mounts (e.g. `Sentry.setupExpressErrorHandler`). */
  beforeErrorHandler?: (app: express.Application) => void;
}

/**
 * Mount the 404 handler and the global error handler. Call AFTER all routes
 * are registered — Express error handlers must be last.
 */
export function finalizeApp(app: express.Application, options: FinalizeAppOptions): express.Application {
  const { errors } = options;

  app.use((req: express.Request, res: express.Response) => {
    errors.handleNotFound(req, res);
  });

  options.beforeErrorHandler?.(app);

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    errors.handleError(err, req, res, next);
  });

  return app;
}
