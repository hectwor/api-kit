/**
 * Shared contracts for the generic CRUD vertical.
 *
 * The vertical is ORM-agnostic: it never imports `@prisma/client`. A Prisma
 * model delegate is structurally compatible with {@link ModelDelegate}, so an
 * app passes `prisma.some_table` directly. Any other data source works as long
 * as it satisfies the same shape.
 */

/**
 * Fields every CRUD entity is expected to carry. All optional so domain
 * entities can extend it freely; the base service/repository only rely on
 * `id`, `userId` and the soft-delete field.
 */
export interface BaseEntity {
  id?: string;
  userId?: string;
  status?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Structural subset of a Prisma model delegate used by the generic repository.
 * `Row` is the persistence row shape (snake_case columns, etc.).
 */
export interface ModelDelegate<Row = Record<string, unknown>> {
  findFirst(args: { where?: Record<string, unknown> }): Promise<Row | null>;
  findMany(args?: {
    where?: Record<string, unknown>;
    take?: number;
    skip?: number;
    orderBy?: unknown;
  }): Promise<Row[]>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<Row>;
  delete(args: { where: Record<string, unknown> }): Promise<Row>;
}

/**
 * Translates between a domain entity and its persistence row. Apps implement
 * one per model (this is the only schema-specific glue the vertical needs).
 */
export interface RowMapper<E extends BaseEntity, Row = Record<string, unknown>> {
  toDomain(row: Row): E;
  toCreateInput(entity: E): Record<string, unknown>;
  toUpdateInput(entity: Partial<E>): Record<string, unknown>;
}

/**
 * Maps a domain entity to the DTO shape returned by the API. Optional — when
 * omitted the entity is returned as-is.
 */
export type EntityToDTO<E extends BaseEntity, DTO = E> = (entity: E) => DTO;

/** A page of results plus the total row count (pre-pagination). */
export interface PageResult<E> {
  items: E[];
  total: number;
}

/**
 * Data-access contract the generic service depends on. Implemented by
 * {@link SoftDeleteUserScopedRepository} or any custom repository.
 */
export interface CrudRepository<E extends BaseEntity> {
  findById(id: string): Promise<E | null>;
  findByIdAndUserId(id: string, userId: string): Promise<E | null>;
  findAll(limit?: number): Promise<E[]>;
  findAllByUserId(userId: string): Promise<E[]>;
  findPaginatedByUserId(userId: string, page: number, limit: number): Promise<PageResult<E>>;
  create(entity: E): Promise<E>;
  update(id: string, entity: Partial<E>): Promise<E | null>;
  /** Removes the row. Soft-delete implementations flip the status field. */
  remove(id: string): Promise<void>;
}
