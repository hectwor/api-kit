import type express from "express";

import { patchAsyncRouteHandlers } from "./async-handler";

export type AppOrRouter = express.Application | express.Router;

/**
 * Base class for route modules. Subclasses register their routes in
 * `configureRoutes()`; async handlers are automatically error-wrapped.
 */
export abstract class CommonRoutesConfig {
  app: AppOrRouter;
  name: string;

  constructor(app: AppOrRouter, name: string) {
    this.app = app;
    patchAsyncRouteHandlers(this.app);
    this.name = name;
    this.configureRoutes();
  }

  getName() {
    return this.name;
  }

  abstract configureRoutes(): AppOrRouter;
}
