export interface CRUD<TResource = unknown, TId = string, TResult = unknown> {
  all: (userId?: string) => Promise<TResult>;
  list: (limit: number, page: number) => Promise<TResult>;
  create: (resource: TResource) => Promise<TResult>;
  updateById: (id: TId, resource: Partial<TResource>, userId?: string) => Promise<TResult>;
  readById: (resourceId: TId, userId?: string) => Promise<TResult>;
  deleteById: (id: TId, resourceId?: TResource, userId?: string) => Promise<TResult>;
}
