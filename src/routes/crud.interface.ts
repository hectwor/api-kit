/**
 * Legacy resource-service contract. Each method is typed against the resource so
 * callers get real types back (no `unknown`/casts): reads/updates/deletes resolve
 * to `TResource | null`, `all`/`list` to `TResource[]`, `create` to `TResource`.
 */
export interface CRUD<TResource = unknown, TId = string, TDelete = TResource | null> {
  all: (userId?: string) => Promise<TResource[]>;
  list: (limit: number, page: number) => Promise<TResource[]>;
  create: (resource: TResource) => Promise<TResource>;
  updateById: (id: TId, resource: Partial<TResource>, userId?: string) => Promise<TResource | null>;
  readById: (resourceId: TId, userId?: string) => Promise<TResource | null>;
  // Delete semantics vary by service (soft-delete returns the row, others a
  // boolean/void) — override `TDelete` to keep the return strongly typed.
  deleteById: (id: TId, userId?: string) => Promise<TDelete>;
}
