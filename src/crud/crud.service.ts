import type { BaseEntity, CrudRepository, PageResult } from "./crud.types";
import type { ListQuery } from "./list-query";

export interface CrudServiceOptions {
  /** Value written to the soft-delete field on create. Default: `"active"`. */
  activeValue?: string;
}

/**
 * Generic user-scoped CRUD service.
 *
 * Encodes the security invariants repeated across domains: operations without
 * a `userId` return empty/null instead of leaking cross-tenant data, and
 * create/update stamp ownership/audit fields. Extend it to add domain rules;
 * override any method as needed.
 */
export class CrudService<E extends BaseEntity> {
  protected readonly activeValue: string;

  constructor(
    protected readonly repository: CrudRepository<E>,
    options: CrudServiceOptions = {},
  ) {
    this.activeValue = options.activeValue ?? "active";
  }

  async create(resource: E): Promise<E> {
    return this.repository.create({
      ...resource,
      createdBy: resource.createdBy ?? resource.userId,
      status: resource.status ?? this.activeValue,
    });
  }

  /** All live rows for a user, optionally filtered/sorted. No `userId` → `[]`. */
  async all(userId?: string, query?: ListQuery): Promise<E[]> {
    if (!userId) return [];
    return this.repository.findAllByUserId(userId, query);
  }

  /** Single row scoped to its owner. No `userId` → `null`. */
  async readById(id: string, userId?: string): Promise<E | null> {
    if (!userId) return null;
    return this.repository.findByIdAndUserId(id, userId);
  }

  /** Updates only after confirming ownership. No `userId` → `null`. */
  async updateById(id: string, resource: Partial<E>, userId?: string): Promise<E | null> {
    if (!userId) return null;
    const existing = await this.repository.findByIdAndUserId(id, userId);
    if (!existing) return null;
    return this.repository.update(id, {
      ...resource,
      updatedBy: resource.updatedBy ?? userId,
    });
  }

  /** Removes only after confirming ownership. No `userId` → `false`. */
  async deleteById(id: string, userId?: string): Promise<boolean> {
    if (!userId) return false;
    const existing = await this.repository.findByIdAndUserId(id, userId);
    if (!existing) return false;
    await this.repository.remove(id);
    return true;
  }

  /** Paginated page for a user, optionally filtered/sorted. No `userId` → empty page. */
  async paginated(userId: string | undefined, page: number, limit: number, query?: ListQuery): Promise<PageResult<E>> {
    if (!userId) return { items: [], total: 0 };
    return this.repository.findPaginatedByUserId(userId, page, limit, query);
  }
}
