/**
 * Generic pagination helpers for list endpoints.
 */

export interface PaginationQuery {
  page: number;
  limit: number;
  offset: number;
}

export interface ParsePaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Parse `page` / `limit` from a query object into safe numbers.
 * Page is 1-based; `offset` is derived for SQL-style skips.
 */
export function parsePagination(query: Record<string, unknown>, options: ParsePaginationOptions = {}): PaginationQuery {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limitUnbounded = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : defaultLimit;
  const limit = Math.min(limitUnbounded, maxLimit);

  return { page, limit, offset: (page - 1) * limit };
}

export interface PaginatedData<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Wrap a list of items with standard pagination metadata.
 */
export function paginatedData<T>(items: T[], page: number, limit: number, total: number): PaginatedData<T> {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

// --- Cursor pagination -------------------------------------------------------

export interface CursorQuery {
  /** Max items requested. */
  limit: number;
  /** Opaque cursor pointing just after the last item of the previous page. */
  cursor?: string;
}

export interface ParseCursorOptions {
  defaultLimit?: number;
  maxLimit?: number;
  /** Query key holding the cursor. Default: `"cursor"`. */
  cursorParam?: string;
}

/**
 * Parse `limit` / `cursor` for keyset (cursor) pagination.
 * Cursor is treated as an opaque string; the repository decodes it.
 */
export function parseCursor(query: Record<string, unknown>, options: ParseCursorOptions = {}): CursorQuery {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const cursorParam = options.cursorParam ?? "cursor";

  const rawLimit = Number(query.limit);
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : defaultLimit, maxLimit);

  const rawCursor = query[cursorParam];
  const cursor = typeof rawCursor === "string" && rawCursor.length > 0 ? rawCursor : undefined;

  return { limit, cursor };
}

export interface CursorData<T> {
  items: T[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Wrap a keyset page. Fetch `limit + 1` rows and pass them here: the extra row
 * signals there is a next page and is dropped from the result. `getCursor`
 * derives the opaque cursor from the last returned item.
 */
export function cursorData<T>(rows: T[], limit: number, getCursor: (item: T) => string): CursorData<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    pagination: {
      limit,
      nextCursor: hasMore && last !== undefined ? getCursor(last) : null,
      hasMore,
    },
  };
}
