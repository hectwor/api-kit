import type express from "express";

import { SCHEMA_TAG } from "../validation/schema-validator";

import { collectExpressRoutes } from "./express-introspect";
import { isJoiLike, joiToOpenApi, type JoiLike } from "./joi-to-openapi";
import { OpenApiRegistry } from "./registry";

/** Find the Joi schema tagged onto a validateSchema middleware in a route's handler chain. */
function findTaggedSchema(handlers: Array<(...args: unknown[]) => unknown>): JoiLike | undefined {
  for (const handler of handlers) {
    const schema = (handler as unknown as Record<string, unknown>)[SCHEMA_TAG];
    if (isJoiLike(schema)) return schema;
  }
  return undefined;
}

export interface OpenApiRoutesOptions {
  registry: OpenApiRegistry;
  /** Path serving the raw document. Default: `"/openapi.json"`. */
  jsonPath?: string;
  /** Path serving Swagger UI. Default: `"/docs"`. `false` disables the UI. */
  docsPath?: string | false;
  /**
   * When set, every route registered on this app that isn't already documented
   * is added as a bare operation — so the spec reflects the live routes even
   * without explicit descriptions. Pass the same app you mount routes on.
   */
  introspect?: express.IRouter;
  /** Paths (prefixes) to omit from introspection, e.g. the docs paths. */
  introspectIgnore?: string[];
  /** Swagger UI CDN version. Default: `"5"`. */
  swaggerUiVersion?: string;
}

function swaggerHtml(jsonPath: string, title: string, version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${version}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${version}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: ${JSON.stringify(jsonPath)}, dom_id: "#swagger-ui", deepLinking: true });
  </script>
</body>
</html>`;
}

/**
 * Serve a live OpenAPI document and Swagger UI.
 *
 * The JSON is rebuilt on every request from the registry (and, if `introspect`
 * is set, from the app's current route table), so the spec is always in sync
 * with the running server — there is no static file to edit.
 */
export function createOpenApiRoutes(app: express.IRouter, options: OpenApiRoutesOptions): void {
  const { registry } = options;
  const jsonPath = options.jsonPath ?? "/openapi.json";
  const docsPath = options.docsPath ?? "/docs";
  const uiVersion = options.swaggerUiVersion ?? "5";
  const ignore = [jsonPath, ...(docsPath ? [docsPath] : []), ...(options.introspectIgnore ?? [])];

  app.get(jsonPath, (_req, res) => {
    if (options.introspect) {
      for (const route of collectExpressRoutes(options.introspect)) {
        if (ignore.some((p) => route.path === p || route.path.startsWith(p))) continue;
        if (registry.hasPath(route.method, route.path)) continue;

        // Auto-derive the request body from a validateSchema-tagged handler.
        const bodyMethod = route.method === "post" || route.method === "put" || route.method === "patch";
        const tagged = bodyMethod ? findTaggedSchema(route.handlers) : undefined;

        registry.addPath({
          method: route.method,
          path: route.path,
          tags: ["(undocumented)"],
          ...(tagged && { requestBody: joiToOpenApi(tagged) }),
          responses: { "200": { description: "OK" } },
        });
      }
    }
    res.json(registry.build());
  });

  if (docsPath) {
    const doc = registry.build() as { info: { title: string; version: string } };
    app.get(docsPath, (_req, res) => {
      res.type("html").send(swaggerHtml(jsonPath, doc.info.title, uiVersion));
    });
  }
}
