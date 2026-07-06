import type express from "express";

import { patchAsyncRouteHandlers } from "../routes/async-handler";
import type { AppOrRouter } from "../routes/routes-config";

import type { CrudController } from "./crud.controller";

export type CrudAction = "list" | "paginated" | "getById" | "create" | "update" | "remove";

export interface CrudRoutesConfig {
  /** Base path for the resource, e.g. `"/api/v1/banks"`. */
  basePath: string;
  controller: CrudController;
  /** Route param used for `/:id` routes. Default: `"id"`. */
  idParam?: string;
  /** Auth/middleware applied to every action (e.g. the kit's `validateToken`). */
  auth?: express.RequestHandler | express.RequestHandler[];
  /** Per-action validation middleware (e.g. `kit.validateSchema(schema)`). */
  validate?: {
    create?: express.RequestHandler;
    update?: express.RequestHandler;
  };
  /**
   * Extra per-action middleware, inserted after `auth`/`validate` and before the
   * controller handler — for cross-cutting concerns the generic controller doesn't
   * own (idempotency, feature gating, uniqueness or existence checks, etc.).
   * Runs in array order, giving the caller full control over interleaving.
   */
  middleware?: Partial<Record<CrudAction, express.RequestHandler | express.RequestHandler[]>>;
  /** Restrict to a subset of actions. Default: all. */
  only?: CrudAction[];
  /** Mount a `GET {basePath}/paginated` route. Default: `false`. */
  enablePaginated?: boolean;
  /**
   * HTTP method for the update route. Default: `"put"`. The controller's
   * `update` handler already treats the body as a partial patch regardless of
   * verb, so `"patch"` is the more accurate REST semantic when the update
   * genuinely accepts a subset of fields — set it per-resource as needed.
   */
  updateMethod?: "put" | "patch";
}

const ALL_ACTIONS: CrudAction[] = ["list", "paginated", "getById", "create", "update", "remove"];

function toArray(mw?: express.RequestHandler | express.RequestHandler[]): express.RequestHandler[] {
  if (!mw) return [];
  return Array.isArray(mw) ? mw : [mw];
}

/**
 * Wire the standard REST surface for a CRUD resource onto a router:
 *
 * ```
 * GET    {basePath}            → list
 * GET    {basePath}/paginated  → paginated   (opt-in)
 * POST   {basePath}            → create
 * GET    {basePath}/:id        → getById
 * PUT|PATCH {basePath}/:id     → update      (PUT by default, see `updateMethod`)
 * DELETE {basePath}/:id        → remove
 * ```
 *
 * Auth and validation are injected, not assumed. Returns the router for chaining.
 */
export function registerCrudRoutes(app: AppOrRouter, config: CrudRoutesConfig): AppOrRouter {
  patchAsyncRouteHandlers(app);

  const { basePath, controller } = config;
  const idParam = config.idParam ?? "id";
  const idPath = `${basePath}/:${idParam}`;
  const auth = toArray(config.auth);
  // `only` is authoritative when given; otherwise all actions, with
  // `paginated` opt-in via `enablePaginated`.
  const enabled = new Set<CrudAction>(config.only ?? ALL_ACTIONS);
  if (!config.only && !config.enablePaginated) {
    enabled.delete("paginated");
  }

  const extra = (action: CrudAction) => toArray(config.middleware?.[action]);

  if (enabled.has("paginated")) {
    app.route(`${basePath}/paginated`).get(...auth, ...extra("paginated"), controller.paginated);
  }

  const collection = app.route(basePath);
  if (enabled.has("list")) collection.get(...auth, ...extra("list"), controller.list);
  if (enabled.has("create")) collection.post(...auth, ...toArray(config.validate?.create), ...extra("create"), controller.create);

  const item = app.route(idPath);
  if (enabled.has("getById")) item.get(...auth, ...extra("getById"), controller.getById);
  if (enabled.has("update")) {
    const updateMethod = config.updateMethod ?? "put";
    item[updateMethod](...auth, ...toArray(config.validate?.update), ...extra("update"), controller.update);
  }
  if (enabled.has("remove")) item.delete(...auth, ...extra("remove"), controller.remove);

  return app;
}
