import type express from "express";

import { SCHEMA_TAG } from "../validation/schema-validator";

import { collectExpressRoutes, type DiscoveredRoute } from "./express-introspect";
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
  /**
   * Swagger tag for routes discovered via `introspect` that weren't explicitly
   * documented. Without this every introspected route lands in a single flat
   * `"(undocumented)"` bucket, which is unreadable once an app has more than a
   * handful of resources.
   *
   * Pass a resolver `(route) => tag` to group them (e.g. by resource). When it
   * returns `undefined`, the tag is derived from the URL path — the first
   * meaningful segment after any `api` / `v1`-style prefix (so
   * `/api/v1/movement/:id` → `"movement"`). Omit the option entirely to get that
   * path-derived grouping by default. Pass a static string to force one tag.
   */
  introspectTag?: string | ((route: DiscoveredRoute) => string | undefined);
  /** Swagger UI CDN version. Default: `"5"`. */
  swaggerUiVersion?: string;
  /**
   * Per-request CSP nonce for the Swagger UI's inline `<script>`. Apps running a
   * strict Content-Security-Policy (`script-src` without `'unsafe-inline'`) must
   * supply the same nonce their CSP advertises, otherwise the browser blocks the
   * inline bootstrap and the UI never mounts.
   *
   * Pass a resolver `(req, res) => nonce` or a static string. When omitted, the
   * common `res.locals.nonce` convention (set by helmet et al.) is used
   * automatically. If nothing resolves, no `nonce` attribute is emitted, so the
   * output is byte-for-byte identical for apps without a CSP.
   */
  nonce?: string | ((req: express.Request, res: express.Response) => string | undefined);
}

function swaggerHtml(jsonPath: string, title: string, version: string, nonce?: string): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
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
  <script${nonceAttr}>
    window.ui = SwaggerUIBundle({ url: ${JSON.stringify(jsonPath)}, dom_id: "#swagger-ui", deepLinking: true });
  </script>
</body>
</html>`;
}

/**
 * Derive a Swagger tag from a URL path: the first segment that isn't an `api`
 * prefix or a `v1`-style version, e.g. `/api/v1/movement/:id` → `"movement"`.
 * Falls back to `"(undocumented)"` when no meaningful segment exists.
 */
function deriveTagFromPath(path: string): string {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg === "api" || /^v\d+$/.test(seg)) continue;
    if (seg.startsWith(":")) break; // a param before any resource segment -> nothing to name it after
    return seg;
  }
  return "(undocumented)";
}

/** Pick the tag for an introspected, otherwise-undocumented route. */
function resolveIntrospectTag(options: OpenApiRoutesOptions, route: DiscoveredRoute): string {
  const { introspectTag } = options;
  const value = typeof introspectTag === "function" ? introspectTag(route) : introspectTag;
  return value ?? deriveTagFromPath(route.path);
}

/** Resolve the CSP nonce for a docs request, falling back to `res.locals.nonce`. */
function resolveNonce(options: OpenApiRoutesOptions, req: express.Request, res: express.Response): string | undefined {
  const { nonce } = options;
  const value = typeof nonce === "function" ? nonce(req, res) : nonce;
  const resolved = value ?? (res.locals as Record<string, unknown>).nonce;
  return typeof resolved === "string" && resolved.length > 0 ? resolved : undefined;
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
          tags: [resolveIntrospectTag(options, route)],
          ...(tagged && { requestBody: joiToOpenApi(tagged) }),
          responses: { "200": { description: "OK" } },
        });
      }
    }
    res.json(registry.build());
  });

  if (docsPath) {
    const doc = registry.build() as { info: { title: string; version: string } };
    app.get(docsPath, (req, res) => {
      res.type("html").send(swaggerHtml(jsonPath, doc.info.title, uiVersion, resolveNonce(options, req, res)));
    });
  }
}
