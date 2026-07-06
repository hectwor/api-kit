import type { BaseEntity, CrudRepository, ModelDelegate, PageResult, RowMapper } from "./crud.types";
import type { ListQuery } from "./list-query";

/** Prisma `include`/`select` to merge into a query. Provide at most one of the two, matching Prisma's own rule. */
export interface QueryShape {
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

/**
 * Per-operation relation-loading shape, so a resource needing joined data
 * (e.g. a lean `select` for lists but a deep `include` for a single-record
 * read) doesn't have to hand-roll its whole repository just for that.
 * `default` applies to any bucket without its own override.
 */
export interface QueryArgsConfig {
  default?: QueryShape;
  /** `findById` / `findByIdAndUserId`. */
  findById?: QueryShape;
  /** `findAll` / `findAllByUserId` / `findPaginatedByUserId`. */
  list?: QueryShape;
  create?: QueryShape;
  update?: QueryShape;
}

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
  /**
   * Maps `ListQuery` filter/sort field names → row columns. Fields absent from
   * the map fall back to their own name. Only allow-listed fields ever reach
   * here (see `parseListQuery`), so this is just the domain→column rename.
   */
  columnMap?: Record<string, string>;
  /** Columns a `ListQuery.search` term is matched against (case-insensitive contains). */
  searchColumns?: string[];
  /** Per-operation Prisma `include`/`select` — see {@link QueryArgsConfig}. */
  queryArgs?: QueryArgsConfig;
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
  protected readonly columnMap: Record<string, string>;
  protected readonly searchColumns: string[];
  protected readonly queryArgsConfig: QueryArgsConfig;

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
    this.columnMap = config.columnMap ?? {};
    this.searchColumns = config.searchColumns ?? [];
    this.queryArgsConfig = config.queryArgs ?? {};
  }

  /** Resolve the `include`/`select` for one operation bucket, falling back to `queryArgs.default`. */
  protected queryArgs(bucket: keyof Omit<QueryArgsConfig, "default">): QueryShape {
    return this.queryArgsConfig[bucket] ?? this.queryArgsConfig.default ?? {};
  }

  /** `where` clause restricted to live rows. */
  protected activeWhere(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { [this.softDeleteField]: this.activeValue, ...extra };
  }

  protected column(field: string): string {
    return this.columnMap[field] ?? field;
  }

  /** Build a Prisma-style `where` for a user's live rows plus any ListQuery filters/search. */
  protected buildWhere(userId: string, query?: ListQuery): Record<string, unknown> {
    const where = this.activeWhere({ [this.userField]: userId });
    for (const [field, value] of Object.entries(query?.filters ?? {})) {
      where[this.column(field)] = value;
    }
    if (query?.search && this.searchColumns.length > 0) {
      where.OR = this.searchColumns.map((col) => ({ [col]: { contains: query.search, mode: "insensitive" } }));
    }
    return where;
  }

  /** Build a Prisma-style `orderBy` from a ListQuery sort, falling back to the default. */
  protected buildOrderBy(query?: ListQuery): unknown {
    if (query?.sort) return { [this.column(query.sort.field)]: query.sort.dir };
    return this.defaultOrderBy;
  }

  async findById(id: string): Promise<E | null> {
    const row = await this.delegate.findFirst({ where: this.activeWhere({ [this.idField]: id }), ...this.queryArgs("findById") });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<E | null> {
    const row = await this.delegate.findFirst({
      where: this.activeWhere({ [this.idField]: id, [this.userField]: userId }),
      ...this.queryArgs("findById"),
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findAll(limit: number = this.maxFindAll): Promise<E[]> {
    const rows = await this.delegate.findMany({ where: this.activeWhere(), take: limit, ...this.queryArgs("list") });
    return rows.map((row) => this.mapper.toDomain(row));
  }

  async findAllByUserId(userId: string, query?: ListQuery): Promise<E[]> {
    const orderBy = this.buildOrderBy(query);
    const rows = await this.delegate.findMany({
      where: this.buildWhere(userId, query),
      ...(orderBy !== undefined && { orderBy }),
      ...this.queryArgs("list"),
    });
    return rows.map((row) => this.mapper.toDomain(row));
  }

  async findPaginatedByUserId(userId: string, page: number, limit: number, query?: ListQuery): Promise<PageResult<E>> {
    const where = this.buildWhere(userId, query);
    const orderBy = this.buildOrderBy(query);
    const safePage = page >= 1 ? page : 1;
    const safeLimit = limit >= 1 ? limit : 20;
    const [rows, total] = await Promise.all([
      this.delegate.findMany({
        where,
        take: safeLimit,
        skip: (safePage - 1) * safeLimit,
        ...(orderBy !== undefined && { orderBy }),
        ...this.queryArgs("list"),
      }),
      this.delegate.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapper.toDomain(row)), total };
  }

  async create(entity: E): Promise<E> {
    const row = await this.delegate.create({ data: this.mapper.toCreateInput(entity), ...this.queryArgs("create") });
    return this.mapper.toDomain(row);
  }

  async update(id: string, entity: Partial<E>): Promise<E | null> {
    const row = await this.delegate.update({
      where: { [this.idField]: id },
      data: this.mapper.toUpdateInput(entity),
      ...this.queryArgs("update"),
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
