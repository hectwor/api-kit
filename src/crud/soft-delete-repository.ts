import type { BaseEntity, CrudRepository, ModelDelegate, PageResult, RowMapper } from "./crud.types";

export interface SoftDeleteRepositoryConfig<E extends BaseEntity, Row = Record<string, unknown>> {
  /** Prisma-like model delegate (e.g. `prisma.user_banks`). */
  delegate: ModelDelegate<Row>;
  /** Entity <-> row translation. */
  mapper: RowMapper<E, Row>;
  /** Primary-key column. Default: `"id"`. */
  idField?: string;
  /** Owner column used for user-scoped queries. Default: `"user_id"`. */
  userField?: string;
  /** Column holding the soft-delete state. Default: `"status"`. */
  softDeleteField?: string;
  /** Value marking a live row. Default: `"active"`. */
  activeValue?: string;
  /** Value written on remove. Default: `"deleted"`. */
  deletedValue?: string;
  /** When true, `remove()` hard-deletes instead of flipping the status. Default: `false`. */
  hardDelete?: boolean;
  /** Safety cap for unscoped `findAll`. Default: `5000`. */
  maxFindAll?: number;
  /** Default `orderBy` for paginated queries (schema-specific). */
  defaultOrderBy?: unknown;
}

/**
 * Generic repository for the common pattern: user-owned rows with soft-delete.
 *
 * Removes ~50 lines of near-identical Prisma boilerplate per model. Extend it
 * to add model-specific finders; the base covers the standard CRUD surface.
 */
export class SoftDeleteUserScopedRepository<E extends BaseEntity, Row = Record<string, unknown>>
  implements CrudRepository<E>
{
  protected readonly delegate: ModelDelegate<Row>;
  protected readonly mapper: RowMapper<E, Row>;
  protected readonly idField: string;
  protected readonly userField: string;
  protected readonly softDeleteField: string;
  protected readonly activeValue: string;
  protected readonly deletedValue: string;
  protected readonly hardDelete: boolean;
  protected readonly maxFindAll: number;
  protected readonly defaultOrderBy: unknown;

  constructor(config: SoftDeleteRepositoryConfig<E, Row>) {
    this.delegate = config.delegate;
    this.mapper = config.mapper;
    this.idField = config.idField ?? "id";
    this.userField = config.userField ?? "user_id";
    this.softDeleteField = config.softDeleteField ?? "status";
    this.activeValue = config.activeValue ?? "active";
    this.deletedValue = config.deletedValue ?? "deleted";
    this.hardDelete = config.hardDelete ?? false;
    this.maxFindAll = config.maxFindAll ?? 5000;
    this.defaultOrderBy = config.defaultOrderBy;
  }

  /** `where` clause restricted to live rows. */
  protected activeWhere(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { [this.softDeleteField]: this.activeValue, ...extra };
  }

  async findById(id: string): Promise<E | null> {
    const row = await this.delegate.findFirst({ where: this.activeWhere({ [this.idField]: id }) });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<E | null> {
    const row = await this.delegate.findFirst({
      where: this.activeWhere({ [this.idField]: id, [this.userField]: userId }),
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findAll(limit: number = this.maxFindAll): Promise<E[]> {
    const rows = await this.delegate.findMany({ where: this.activeWhere(), take: limit });
    return rows.map((row) => this.mapper.toDomain(row));
  }

  async findAllByUserId(userId: string): Promise<E[]> {
    const rows = await this.delegate.findMany({ where: this.activeWhere({ [this.userField]: userId }) });
    return rows.map((row) => this.mapper.toDomain(row));
  }

  async findPaginatedByUserId(userId: string, page: number, limit: number): Promise<PageResult<E>> {
    const where = this.activeWhere({ [this.userField]: userId });
    const safePage = page >= 1 ? page : 1;
    const safeLimit = limit >= 1 ? limit : 20;
    const [rows, total] = await Promise.all([
      this.delegate.findMany({
        where,
        take: safeLimit,
        skip: (safePage - 1) * safeLimit,
        ...(this.defaultOrderBy !== undefined && { orderBy: this.defaultOrderBy }),
      }),
      this.delegate.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapper.toDomain(row)), total };
  }

  async create(entity: E): Promise<E> {
    const row = await this.delegate.create({ data: this.mapper.toCreateInput(entity) });
    return this.mapper.toDomain(row);
  }

  async update(id: string, entity: Partial<E>): Promise<E | null> {
    const row = await this.delegate.update({
      where: { [this.idField]: id },
      data: this.mapper.toUpdateInput(entity),
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async remove(id: string): Promise<void> {
    if (this.hardDelete) {
      await this.delegate.delete({ where: { [this.idField]: id } });
      return;
    }
    await this.delegate.update({
      where: { [this.idField]: id },
      data: { [this.softDeleteField]: this.deletedValue },
    });
  }
}
