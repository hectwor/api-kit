import type { BaseEntity, CrudRepository, ModelDelegate, PageResult } from "../crud/crud.types";
import type { ListQuery } from "../crud/list-query";

type Row = Record<string, unknown>;

function matchesWhere(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR" && Array.isArray(cond)) {
      return (cond as Record<string, unknown>[]).some((c) => matchesWhere(row, c));
    }
    if (cond && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("not" in c) return row[key] !== c.not;
      if ("contains" in c) {
        const hay = String(row[key] ?? "");
        const needle = String(c.contains);
        return c.mode === "insensitive" ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
      }
    }
    return row[key] === cond;
  });
}

function applyOrderBy(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy || typeof orderBy !== "object") return rows;
  const [field, dir] = Object.entries(orderBy as Record<string, "asc" | "desc">)[0] ?? [];
  if (!field) return rows;
  return [...rows].sort((a, b) => {
    const av = a[field] as string | number;
    const bv = b[field] as string | number;
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return dir === "desc" ? -cmp : cmp;
  });
}

/**
 * In-memory {@link ModelDelegate} for testing `SoftDeleteUserScopedRepository`
 * without a database. Supports the `where` shapes the repository builds:
 * equality, `{ not }`, `OR` + `{ contains, mode }`, `orderBy`, `skip`/`take`.
 */
export function createMemoryDelegate<R extends Row = Row>(seed: R[] = []): ModelDelegate<R> & { rows: R[] } {
  const rows: R[] = [...seed];
  return {
    rows,
    findFirst: ({ where } = {}) => Promise.resolve((rows.find((r) => matchesWhere(r, where)) as R) ?? null),
    findMany: ({ where, take, skip, orderBy } = {}) => {
      let out = rows.filter((r) => matchesWhere(r, where));
      out = applyOrderBy(out, orderBy) as R[];
      if (skip) out = out.slice(skip);
      if (take !== undefined) out = out.slice(0, take);
      return Promise.resolve(out);
    },
    count: ({ where } = {}) => Promise.resolve(rows.filter((r) => matchesWhere(r, where)).length),
    create: ({ data }) => {
      const row = { ...(data as R) };
      rows.push(row);
      return Promise.resolve(row);
    },
    update: ({ where, data }) => {
      const row = rows.find((r) => matchesWhere(r, where));
      if (!row) throw new Error("Row not found for update");
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    delete: ({ where }) => {
      const idx = rows.findIndex((r) => matchesWhere(r, where));
      if (idx === -1) throw new Error("Row not found for delete");
      const [removed] = rows.splice(idx, 1);
      return Promise.resolve(removed);
    },
  };
}

export interface InMemoryCrudRepositoryOptions {
  /** Fields a `ListQuery.search` term matches against. */
  searchFields?: string[];
  /** Value written on soft remove. Default: `"deleted"`. */
  deletedValue?: string;
  /** Value marking a live row. Default: `"active"`. */
  activeValue?: string;
}

/**
 * Ready-made in-memory {@link CrudRepository} for testing services/controllers
 * that depend on the CRUD contract — including user-scoping, soft-delete, and
 * `ListQuery` filters/sort/search. No delegate/mapper wiring needed.
 */
export class InMemoryCrudRepository<E extends BaseEntity> implements CrudRepository<E> {
  private idSeq = 0;
  readonly rows: E[] = [];
  private readonly searchFields: string[];
  private readonly deletedValue: string;
  private readonly activeValue: string;

  constructor(seed: E[] = [], options: InMemoryCrudRepositoryOptions = {}) {
    this.searchFields = options.searchFields ?? [];
    this.deletedValue = options.deletedValue ?? "deleted";
    this.activeValue = options.activeValue ?? "active";
    for (const row of seed) this.rows.push({ ...row, id: row.id ?? this.nextId(), status: row.status ?? this.activeValue });
  }

  private nextId(): string {
    return `mem_${++this.idSeq}`;
  }

  private live(): E[] {
    return this.rows.filter((r) => r.status !== this.deletedValue);
  }

  private applyQuery(items: E[], query?: ListQuery): E[] {
    let out = items;
    if (query?.filters) {
      out = out.filter((r) =>
        Object.entries(query.filters!).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
      );
    }
    if (query?.search && this.searchFields.length > 0) {
      const needle = query.search.toLowerCase();
      out = out.filter((r) => this.searchFields.some((f) => String((r as Record<string, unknown>)[f] ?? "").toLowerCase().includes(needle)));
    }
    if (query?.sort) {
      const { field, dir } = query.sort;
      out = [...out].sort((a, b) => {
        const av = (a as Record<string, unknown>)[field] as string | number;
        const bv = (b as Record<string, unknown>)[field] as string | number;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return dir === "desc" ? -cmp : cmp;
      });
    }
    return out;
  }

  async findById(id: string): Promise<E | null> {
    return this.live().find((r) => r.id === id) ?? null;
  }
  async findByIdAndUserId(id: string, userId: string): Promise<E | null> {
    return this.live().find((r) => r.id === id && r.userId === userId) ?? null;
  }
  async findAll(limit?: number): Promise<E[]> {
    const out = this.live();
    return limit ? out.slice(0, limit) : out;
  }
  async findAllByUserId(userId: string, query?: ListQuery): Promise<E[]> {
    return this.applyQuery(this.live().filter((r) => r.userId === userId), query);
  }
  async findPaginatedByUserId(userId: string, page: number, limit: number, query?: ListQuery): Promise<PageResult<E>> {
    const all = this.applyQuery(this.live().filter((r) => r.userId === userId), query);
    return { items: all.slice((page - 1) * limit, page * limit), total: all.length };
  }
  async create(entity: E): Promise<E> {
    const row = { ...entity, id: entity.id ?? this.nextId() };
    this.rows.push(row);
    return row;
  }
  async update(id: string, entity: Partial<E>): Promise<E | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, entity);
    return row;
  }
  async remove(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) (row as BaseEntity).status = this.deletedValue;
  }
}
