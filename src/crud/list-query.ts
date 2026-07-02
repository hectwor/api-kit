/**
 * Safe parsing of list/pagination query strings into a structured `ListQuery`.
 *
 * Everything is allowlisted: only fields you explicitly permit become filters
 * or sort keys, so query params can't reach arbitrary columns.
 */

export interface ListSort {
  field: string;
  dir: "asc" | "desc";
}

export interface ListQuery {
  /** Equality filters keyed by (domain) field name. */
  filters?: Record<string, unknown>;
  /** Requested sort, already validated against the allow-list. */
  sort?: ListSort;
  /** Free-text search term. */
  search?: string;
}

export interface ParseListQueryOptions {
  /** Query keys allowed to become equality filters. */
  allowedFilters?: string[];
  /** Field names allowed in `sort`. */
  allowedSort?: string[];
  /** Default sort applied when the request omits one (or asks for a disallowed field). */
  defaultSort?: ListSort;
  /** Query key carrying the free-text search term. Default: `"q"`. */
  searchParam?: string;
  /**
   * How sort is expressed in the query. Supports either:
   *  - `?sort=name:desc` (single key), or
   *  - `?sortBy=name&order=desc` (split keys).
   * Both are read; `sort` wins when both are present.
   */
  sortKey?: string;
  sortByKey?: string;
  orderKey?: string;
}

function coerce(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function parseSort(query: Record<string, unknown>, options: ParseListQueryOptions): ListSort | undefined {
  const allowed = options.allowedSort ?? [];
  const sortKey = options.sortKey ?? "sort";
  const sortByKey = options.sortByKey ?? "sortBy";
  const orderKey = options.orderKey ?? "order";

  let field: string | undefined;
  let dir: "asc" | "desc" = "asc";

  const combined = query[sortKey];
  if (typeof combined === "string" && combined.length > 0) {
    const [f, d] = combined.split(":");
    field = f;
    if (d === "desc" || d === "asc") dir = d;
  } else if (typeof query[sortByKey] === "string") {
    field = query[sortByKey] as string;
    const order = query[orderKey];
    if (order === "desc" || order === "asc") dir = order;
  }

  if (field && allowed.includes(field)) return { field, dir };
  return options.defaultSort;
}

/**
 * Turn an Express `req.query` into a validated {@link ListQuery}.
 * Unknown keys are ignored; only allow-listed filters/sort survive.
 */
export function parseListQuery(query: Record<string, unknown>, options: ParseListQueryOptions = {}): ListQuery {
  const result: ListQuery = {};

  const allowedFilters = options.allowedFilters ?? [];
  if (allowedFilters.length > 0) {
    const filters: Record<string, unknown> = {};
    for (const key of allowedFilters) {
      if (query[key] !== undefined && query[key] !== "") filters[key] = coerce(query[key]);
    }
    if (Object.keys(filters).length > 0) result.filters = filters;
  }

  const sort = parseSort(query, options);
  if (sort) result.sort = sort;

  const searchParam = options.searchParam ?? "q";
  const search = query[searchParam];
  if (typeof search === "string" && search.trim().length > 0) result.search = search.trim();

  return result;
}
