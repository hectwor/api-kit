import type express from "express";

import { ForbiddenError } from "../errors";

import type { RequireUserId } from "./request-user";

/**
 * Builds a middleware factory that guards a route behind an async, per-user
 * check — not tied to any specific entitlement model. The app supplies what
 * "access" means (subscription tier, role, plan limit, feature flag, ...);
 * this only owns the request plumbing (userId extraction, calling `check`,
 * denying vs proceeding) shared by all of them.
 *
 *   const hasFeature = createAccessGate<SubscriptionFeatures>({
 *     requireUserId,
 *     check: (userId, feature) => subscriptionService.hasFeature(userId, feature),
 *     onDenied: (userId, feature) => new SubscriptionAccessDeniedError(userId, feature),
 *   });
 *
 *   router.post("/banks", hasFeature(SubscriptionFeatures.CREATE_BANKS), controller.create);
 *
 * `onDenied` is optional — omit it to get a generic `ForbiddenError` (403).
 */
export interface CreateAccessGateOptions<TRequirement> {
  /** Guard from the app's kit; also handles the 401 when no userId is present. */
  requireUserId: RequireUserId;
  /** Resolve whether `userId` satisfies `requirement` for this request. */
  check: (userId: string, requirement: TRequirement, req: express.Request) => Promise<boolean>;
  /** Build the error forwarded to `next()` when `check` resolves false. Default: `ForbiddenError`. */
  onDenied?: (userId: string, requirement: TRequirement) => Error;
}

/** A gate is called with the specific requirement for a route, returning the actual middleware. */
export type AccessGate<TRequirement> = (requirement: TRequirement) => express.RequestHandler;

export function createAccessGate<TRequirement>(options: CreateAccessGateOptions<TRequirement>): AccessGate<TRequirement> {
  const { requireUserId, check, onDenied } = options;

  return (requirement: TRequirement) => {
    return async (req, res, next) => {
      try {
        const userId = requireUserId(req, res);
        if (!userId) return;

        const allowed = await check(userId, requirement, req);
        if (!allowed) {
          next(onDenied ? onDenied(userId, requirement) : new ForbiddenError(`Access denied for requirement "${String(requirement)}"`, { requirement, userId }));
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}
