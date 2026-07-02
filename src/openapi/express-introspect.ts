import type express from "express";

import type { HttpMethod } from "./registry";

export interface DiscoveredRoute {
  method: HttpMethod;
  path: string;
}

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[] };
  regexp?: RegExp;
  keys?: Array<{ name: string }>;
}

const METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * Reconstruct a mount prefix from an Express router layer's regexp.
 * Handles the common fast-slash form; returns "" when it can't be recovered.
 */
function prefixFromRegexp(layer: Layer): string {
  if (!layer.regexp) return "";
  const source = layer.regexp.source;
  if (source === "^\\/?$" || source === "^\\/?(?=\\/|$)") return "";
  const match = source.match(/^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/) ?? source.match(/^\^\\\/(.*?)\\\/\?\$/);
  if (!match) return "";
  return "/" + match[1].replace(/\\\//g, "/");
}

function collect(stack: Layer[], base: string, out: DiscoveredRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const method of METHODS) {
          if (layer.route.methods[method]) out.push({ method, path: base + p });
        }
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, base + prefixFromRegexp(layer), out);
    }
  }
}

/**
 * Walk an Express app/router and list every registered `{ method, path }`.
 *
 * Best-effort: mounted sub-router prefixes are reconstructed from their regexp.
 * Used to surface endpoints in the OpenAPI doc even when they weren't described
 * explicitly, so nothing silently goes undocumented.
 */
export function collectExpressRoutes(app: express.IRouter): DiscoveredRoute[] {
  const root = (app as unknown as { _router?: { stack: Layer[] }; stack?: Layer[] });
  const stack = root._router?.stack ?? root.stack ?? [];
  const out: DiscoveredRoute[] = [];
  collect(stack, "", out);
  return out;
}
