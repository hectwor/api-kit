import type express from "express";

import { ActivityAction, ActivityStatus } from "./activity-log.types";
import type { LogActivity } from "./activity-logger";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const DEFAULT_ACTION_BY_METHOD: Record<string, string> = {
  POST: ActivityAction.CREATE,
  PUT: ActivityAction.UPDATE,
  PATCH: ActivityAction.UPDATE,
  DELETE: ActivityAction.DELETE,
};

const DEFAULT_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export interface ActivityLogMiddlewareOptions {
  /** Route prefix the audited routes live under, e.g. "/api/v1". */
  apiPrefix: string;
  /** Route segment (after the prefix) → entity_type stored in the audit log. Only listed segments are audited. */
  entitiesBySegment: Record<string, string>;
  /** Sub-paths under audited segments that are reads/utilities, not object mutations. */
  skipSubpaths?: string[];
  /** Sink for audit entries — usually `createActivityLogger(service)`. */
  log: LogActivity;
  /** Pattern the authenticated userId (and entity ids in paths) must match. Default: UUID v1-5. */
  idPattern?: RegExp;
  /** HTTP method → action name. Default: POST=CREATE, PUT/PATCH=UPDATE, DELETE=DELETE. */
  actionByMethod?: Record<string, string>;
}

/**
 * Audits every mutating request on whitelisted entity routes — both successful
 * and failed attempts. Fire-and-forget: auditing never affects the response.
 */
export function createActivityLogMiddleware(options: ActivityLogMiddlewareOptions): express.RequestHandler {
  const { apiPrefix, entitiesBySegment, log } = options;
  const skipSubpaths = options.skipSubpaths ?? [];
  const idPattern = options.idPattern ?? DEFAULT_ID_PATTERN;
  const actionByMethod = options.actionByMethod ?? DEFAULT_ACTION_BY_METHOD;

  const prefix = apiPrefix.endsWith("/") ? apiPrefix.slice(0, -1) : apiPrefix;
  const segmentRe = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/]+)(/.*)?$`);

  function hasSkippedSubpath(rest: string): boolean {
    return skipSubpaths.some((sub) => rest === sub || rest.startsWith(`${sub}/`) || (sub.endsWith("/") && rest.startsWith(sub)));
  }

  function resolveEntity(path: string): string | undefined {
    const match = segmentRe.exec(path);
    if (!match) return undefined;
    const entity = entitiesBySegment[match[1]];
    if (!entity) return undefined;
    // Only check the remainder after the segment, so a segment name is never
    // confused with a skip sub-path of another segment.
    if (match[2] && hasSkippedSubpath(match[2])) return undefined;
    return entity;
  }

  return (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const entityType = resolveEntity(req.path);
    if (!entityType) return next();

    // Capture the JSON body to extract the created entity id (success) or error code (failure).
    let capturedBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      capturedBody = body;
      return originalJson(body);
    };

    res.on("finish", () => {
      try {
        // Token middleware sets req.headers.userId; without an authenticated user there is no one to attribute.
        const userId = req.headers.userId?.toString();
        if (!userId || !idPattern.test(userId)) return;

        const success = res.statusCode < 400;
        const body = capturedBody as { data?: { id?: string }; error?: { code?: string } } | undefined;

        const entityIdFromBody = typeof body?.data?.id === "string" ? body.data.id : undefined;
        const entityIdFromPath = idPattern.exec(req.path)?.[0];

        log({
          userId,
          action: actionByMethod[req.method] ?? req.method,
          status: success ? ActivityStatus.SUCCESS : ActivityStatus.FAILED,
          errorCode: success ? undefined : (body?.error?.code ?? `HTTP_${res.statusCode}`),
          entityType,
          entityId: success ? (entityIdFromBody ?? entityIdFromPath) : entityIdFromPath,
          metadata: { path: req.path },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      } catch {
        // Auditing must never break a request — swallow and move on.
      }
    });

    next();
  };
}
