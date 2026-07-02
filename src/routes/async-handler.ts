import type express from "express";

const ROUTE_METHODS = ["all", "get", "post", "put", "patch", "delete", "options", "head"] as const;

const wrapHandler = (handler: express.RequestHandler): express.RequestHandler => {
  return (req, res, next) => {
    try {
      const result: unknown = handler(req, res, next);
      if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === "function") {
        void (result as Promise<unknown>).catch(next);
      }
      return result;
    } catch (error) {
      next(error);
      return undefined;
    }
  };
};

/**
 * Patch `app.route(path)` so every registered handler (sync or async) forwards
 * thrown errors and rejected promises to `next()`, feeding the global error
 * middleware without per-handler try/catch.
 */
export const patchAsyncRouteHandlers = (app: express.Application | express.Router): void => {
  const patchedApp = app as express.Application & {
    __asyncRouteHandlersPatched?: boolean;
    route: express.Application["route"];
  };

  if (patchedApp.__asyncRouteHandlersPatched) {
    return;
  }

  const originalRoute = patchedApp.route.bind(app);

  patchedApp.route = ((path: string) => {
    const route = originalRoute(path) as unknown as Record<string, unknown>;

    for (const method of ROUTE_METHODS) {
      const originalMethod = route[method];
      if (typeof originalMethod !== "function") {
        continue;
      }

      route[method] = ((...handlers: express.RequestHandler[]) => {
        (originalMethod as (...handlers: express.RequestHandler[]) => unknown).apply(route, handlers.map(wrapHandler));
        return route;
      }) as typeof originalMethod;
    }

    return route;
  }) as unknown as express.Application["route"];

  patchedApp.__asyncRouteHandlersPatched = true;
};
