# @hectordahv/api-kit

Opinionated Express + TypeScript API foundation **and scaffolder**, extracted from a production backend. Everything a standardized REST service needs, wired once and reused across apps.

**Foundation**
- **Standardized responses** — one `{ message, data|error, metadata }` envelope on every route, via `ResponseBuilder`.
- **Error handling** — `BusinessError` taxonomy + global middleware mapping Business/Joi/Prisma errors to the envelope.
- **Auth** — JWT verify middleware with an injectable claim extractor, plus `TokenPairService` for stateless access/refresh issuing and rotation.
- **Structured logging** — Winston with request-scoped correlation IDs (AsyncLocalStorage).
- **Validation** — Joi body-validation middleware.
- **Rate limiting & idempotency** — IP + per-user limiters (optional Redis store) and idempotent replay via a `KeyValueStore`.
- **App bootstrap** — `createApp`/`finalizeApp` assemble the standard middleware stack (helmet, CORS, identity-header stripping, sanitization) in one call.
- **Graceful shutdown & startup tasks** — `createHttpServer` (drain → cleanup → exit) and `runStartupTasks`.

**Productivity**
- **Generic CRUD vertical** — a user-scoped, soft-delete REST resource (repository → service → controller → routes) in ~30 lines, ORM-agnostic.
- **Live OpenAPI + Swagger UI** — generated from the same Joi schemas you validate with and the live route table; no hand-edited JSON.
- **Opt-in modules** — activity log (audit trail), parameter catalog (runtime config), health checks.
- **Scaffolder** — `npx @hectordahv/api-kit new <dir>` generates a runnable starter.

**Principles**
- **No global state** — create one `ApiKit` per app; several can coexist in one process.
- **No ORM/vendor lock-in** — Prisma error codes are matched structurally; Redis and Sentry are injected behind tiny interfaces; module persistence is a repository interface your app implements.
- **CJS + ESM**, Node >= 20, Express 4, tree-shakeable subpath exports.

## Scaffold a new backend

```bash
npx @hectordahv/api-kit new my-api
cd my-api && npm install && cp .env.example .env && npm run dev
# → runnable API with a CRUD resource + live Swagger UI at http://localhost:3000/docs
```

## Install (into an existing project)

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
| `@hectordahv/api-kit` | `createApiKit` kernel + re-exports of the core subpaths (`/errors`, `/http`, `/logging`, `/middleware`, `/validation`, `/auth`, `/routes`, `/config`). `/app`, `/crud`, `/server`, `/openapi` and the opt-in modules are imported from their own subpath |
| `/errors` | `BusinessError` base + `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `UnprocessableError`, auth/resource error families |
| `/http` | `ResponseBuilder`, `HTTP_STATUS`, `ERROR_CODES`/`SUCCESS_CODES`, message catalogs (`messagesEn`, `messagesEs`), pagination helpers |
| `/logging` | `createLogger` (Winston, correlation IDs via AsyncLocalStorage), `createRequestLogging` |
| `/middleware` | `createErrorMiddleware` (Business/Joi/Prisma-duck-typed mapping), rate limiters + `createRedisRateLimitStore`, `idempotencyMiddleware`, sanitization, `KeyValueStore`/`RedisLike` abstractions |
| `/validation` | `createSchemaValidator` (Joi) |
| `/auth` | `generateToken`/`verifyToken`, `createValidateToken` (claim extractor injectable), `createRequireUserId`, `TokenPairService` (stateless access/refresh issue + rotation) |
| `/routes` | `CommonRoutesConfig` base class, async-handler patching, `CRUD` interface, `BaseDTO` |
| `/config` | `validateEnvVars(required[])`, `getEnv`, `isProd`/`isDev` |
| `/app` | `createApp`/`finalizeApp` — standard middleware stack in one call |
| `/crud` | Opt-in generic CRUD vertical: `SoftDeleteUserScopedRepository`, `CrudService`, `createCrudController`, `registerCrudRoutes` — a user-scoped, soft-delete REST resource in ~30 lines |
| `/server` | `createHttpServer` (graceful shutdown: drain, cleanup callbacks, force-exit timeout) + `runStartupTasks` (uniform logging + fatal/non-fatal policy) |
| `/openapi` | Live OpenAPI 3.0 + Swagger UI generated from your Joi schemas and routes — `OpenApiRegistry`, `joiToOpenApi`, `documentCrudResource`, `collectExpressRoutes`, `createOpenApiRoutes`. No hand-edited JSON |
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

### Generic CRUD in ~30 lines

`/crud` collapses the repeated repository → service → controller → routes stack
into configuration. It is ORM-agnostic: a Prisma model delegate is structurally
compatible, so you pass `prisma.some_table` directly and supply one small mapper.

```ts
import {
  SoftDeleteUserScopedRepository,
  CrudService,
  createCrudController,
  registerCrudRoutes,
  type RowMapper,
} from "@hectordahv/api-kit/crud";

interface Bank { id?: string; userId?: string; status?: string; name?: string }

// The only schema-specific glue: entity <-> row.
const mapper: RowMapper<Bank> = {
  toDomain: (r) => ({ id: r.id as string, userId: r.user_id as string, status: r.status as string, name: r.name as string }),
  toCreateInput: (b) => ({ id: b.id, user_id: b.userId, status: b.status ?? "active", name: b.name }),
  toUpdateInput: (b) => ({ ...(b.name !== undefined && { name: b.name }) }),
};

const repository = new SoftDeleteUserScopedRepository<Bank>({ delegate: prisma.user_banks, mapper });
const service = new CrudService<Bank>(repository);
const controller = createCrudController<Bank>({ resource: "Bank", service, responses: kit.responses, requireUserId: kit.requireUserId });

registerCrudRoutes(apiRouter, {
  basePath: "/api/v1/banks",
  controller,
  auth: kit.validateToken({ getKey: () => process.env.JWT_KEY! }),
  validate: { create: kit.validateSchema(CreateBankSchema), update: kit.validateSchema(UpdateBankSchema) },
  enablePaginated: true,
});
```

- **User-scoped by default** — operations without a `userId` return empty/null instead of leaking cross-tenant rows; ownership is verified before update/delete.
- **Soft-delete by default** — `remove()` flips `status` to `deleted`; pass `hardDelete: true` to actually delete.
- **Override anything** — extend `CrudService`/`SoftDeleteUserScopedRepository` for domain rules, or use `only`/`validate`/`toDTO` to shape the surface.

### Boot & graceful shutdown

```ts
import { createHttpServer, runStartupTasks } from "@hectordahv/api-kit/server";

await runStartupTasks(
  [
    { name: "seed-catalog", run: () => seedCatalog() },        // non-fatal by default
    { name: "db-migrate-check", run: () => assertSchema(), fatal: true },
  ],
  { logger: kit.logger },
);

createHttpServer(app, {
  port: process.env.PORT,
  logger: kit.logger,
  onShutdown: [() => prisma.$disconnect(), () => redis.quit()],
}).listen();
```

On `SIGTERM`/`SIGINT`: stop accepting connections → run cleanup callbacks → exit,
with a force-exit timeout if a callback hangs.

### Live API docs (no static JSON)

The spec is generated from the same Joi schemas you validate with and the app's
route table, and rebuilt on every request — change a DTO or add a route and
`/openapi.json` + Swagger UI reflect it immediately.

```ts
import { OpenApiRegistry, documentCrudResource, createOpenApiRoutes } from "@hectordahv/api-kit/openapi";

const openapi = new OpenApiRegistry({ title: "My API", version: "1.0.0" });

// Rich CRUD docs from the same schemas used for validation:
documentCrudResource({
  registry: openapi,
  basePath: "/api/v1/banks",
  tag: "Banks",
  dtoName: "Bank",
  createSchema: CreateBankSchema,   // Joi — becomes the request body schema
  updateSchema: UpdateBankSchema,
  paginated: true,
});

// Serve it. `introspect` surfaces any route not explicitly documented, so
// nothing is silently missing from the spec.
createOpenApiRoutes(app, { registry: openapi, introspect: app });
// → GET /openapi.json (live)   GET /docs (Swagger UI)
```

`joiToOpenApi(schema)` converts any Joi schema on its own; `OpenApiRegistry.addPath(...)`
documents individual non-CRUD routes.

### Stateless refresh tokens

```ts
import { TokenPairService } from "@hectordahv/api-kit/auth";

const tokens = new TokenPairService({
  accessKey: process.env.JWT_KEY!,
  refreshKey: process.env.JWT_REFRESH_KEY!,
  accessTtl: "15m",
  refreshTtl: "7d",
});

const pair = tokens.issue(user.id, { remember: true });   // { accessToken, refreshToken }
const rotated = tokens.refresh(oldRefreshToken);           // verifies + mints a fresh pair
```

No database or rotation bookkeeping: `refresh()` verifies the refresh JWT and re-issues,
preserving the original `remember` choice. Claim shape is configurable (`idClaim`,
`extractUserId`) and supports the legacy `{ user: { _id } }` payload by default.

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
