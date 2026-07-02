# @hectordahv/api-kit

Opinionated Express + TypeScript API foundation. Extracted from a production backend: standardized response envelope, global error handling, JWT auth middleware, distributed rate limiting, structured logging with correlation IDs, Joi validation, idempotency, and opt-in modules (activity log, parameter catalog, health checks).

- **No global state** — create one `ApiKit` per app; several can coexist in one process.
- **No ORM/vendor lock-in** — Prisma error codes are matched structurally, Redis and Sentry are injected behind tiny interfaces, persistence for the opt-in modules is a repository interface your app implements.
- **CJS + ESM**, Node >= 20, Express 4.

## Install

```bash
npm install @hectordahv/api-kit express
# optional, only if you use validateSchema:
npm install joi
```

## Quickstart

```ts
import { createApiKit, messagesEs } from "@hectordahv/api-kit";
import { createApp, finalizeApp } from "@hectordahv/api-kit/app";
import { createHealthRoutes } from "@hectordahv/api-kit/health";

const kit = createApiKit({
  service: "my-api",
  environment: process.env.NODE_ENV,
  // messages: messagesEs,                       // default is English
  logger: { pretty: process.env.NODE_ENV === "local" },
  // capture: { exception: Sentry.captureException },
});

const { app, apiRouter } = createApp({
  kit,
  apiPrefix: "/api/v1",
  corsOrigins: [/^http:\/\/localhost(:\d+)?$/],
});

const validateToken = kit.validateToken({ getKey: () => process.env.JWT_KEY });

apiRouter.get("/me", validateToken, (req, res) => {
  kit.responses.sendSuccess(res, { id: req.headers.userId }, "RESOURCE_RETRIEVED", "OK");
});

createHealthRoutes(app, { checks: { db: () => db.ping() }, logger: kit.logger });

finalizeApp(app, { errors: kit.errors });

app.listen(3000);
```

Every response uses the same envelope:

```json
{
  "message": { "code": "RESOURCE_RETRIEVED", "text": "OK" },
  "data": { "id": "..." },
  "metadata": {
    "timestamp": "2026-07-02T15:30:45.123Z",
    "version": "1.0",
    "statusCode": 200,
    "requestId": "1712686245123-abc123xyz",
    "path": "/api/v1/me",
    "method": "GET",
    "duration": "45ms",
    "environment": "production"
  }
}
```

## What's in the box

| Subpath | Contents |
|---|---|
| `@hectordahv/api-kit` | `createApiKit` kernel + re-exports of everything below except `/app` and the opt-in modules |
| `/errors` | `BusinessError` base + `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `UnprocessableError`, auth/resource error families |
| `/http` | `ResponseBuilder`, `HTTP_STATUS`, `ERROR_CODES`/`SUCCESS_CODES`, message catalogs (`messagesEn`, `messagesEs`), pagination helpers |
| `/logging` | `createLogger` (Winston, correlation IDs via AsyncLocalStorage), `createRequestLogging` |
| `/middleware` | `createErrorMiddleware` (Business/Joi/Prisma-duck-typed mapping), rate limiters + `createRedisRateLimitStore`, `idempotencyMiddleware`, sanitization, `KeyValueStore`/`RedisLike` abstractions |
| `/validation` | `createSchemaValidator` (Joi) |
| `/auth` | `generateToken`/`verifyToken`, `createValidateToken` (claim extractor injectable), `createRequireUserId` |
| `/routes` | `CommonRoutesConfig` base class, async-handler patching, `CRUD` interface, `BaseDTO` |
| `/config` | `validateEnvVars(required[])`, `getEnv`, `isProd`/`isDev` |
| `/app` | `createApp`/`finalizeApp` — standard middleware stack in one call |
| `/activity-log` | Opt-in audit trail: middleware factory + fire-and-forget logger + service over your repository |
| `/parameter-catalog` | Opt-in runtime config catalog (groups → nodes → typed values) with TTL cache; extensible by subclass |
| `/health` | `createHealthRoutes` with named readiness checks |

## Key design points

### The kit is an instance, not a singleton

```ts
const kit = createApiKit({ service: "billing-api", messages: { NOT_FOUND: "Nope" } });
// kit.logger, kit.responses, kit.errors, kit.requestLogging, kit.sanitization,
// kit.validateSchema, kit.validateToken(opts), kit.requireUserId
```

Messages are merged over the English defaults, so you can override a single key or pass a whole catalog (`messagesEs` ships with the package).

### Bring your own infrastructure

```ts
// Redis (any ioredis-compatible client) — never a hard dependency:
import { createRedisRateLimitStore, redisKeyValueStore, idempotencyMiddleware } from "@hectordahv/api-kit/middleware";
const rateLimitStore = createRedisRateLimitStore(redis);
const idem = idempotencyMiddleware(redisKeyValueStore(redis));

// Sentry (or any APM):
const kit = createApiKit({ service: "x", capture: { exception: Sentry.captureException } });
```

### Opt-in modules own logic, you own persistence

```ts
import { ActivityLogService, createActivityLogger, createActivityLogMiddleware } from "@hectordahv/api-kit/activity-log";

class MyActivityLogRepository implements ActivityLogRepository { /* your ORM here */ }

const audit = createActivityLogMiddleware({
  apiPrefix: "/api/v1",
  entitiesBySegment: { account: "account", movement: "movement" },
  skipSubpaths: ["/stats", "/paginated"],
  log: createActivityLogger(new ActivityLogService(new MyActivityLogRepository()), kit.logger),
});

// mount before routes:
const { app, apiRouter } = createApp({ kit, beforeRoutes: [audit] });
```

```ts
import { ParameterCatalogService, nodeValuesToObject } from "@hectordahv/api-kit/parameter-catalog";

class MyCatalog extends ParameterCatalogService {
  async getFeatureFlags() {
    const group = await this.loadGroup("FEATURE_FLAGS"); // protected, cached, stale-on-error
    return group ? Object.fromEntries(group.parameters.map((n) => [n.code, nodeValuesToObject(n)])) : {};
  }
}
```

### Security defaults

`createApp` wires helmet, CORS, client identity-header stripping (`userId` can only come from a verified JWT), a global IP rate limiter, and input sanitization. Per-route you add:

```ts
import { makeUserLimiter } from "@hectordahv/api-kit/middleware";
const loginLimiter = makeUserLimiter({ name: "login", windowMs: 15 * 60 * 1000, max: 10, store: rateLimitStore });
```

## Development

```bash
npm run typecheck && npm test && npm run build && npm run check-exports
```

## License

MIT
