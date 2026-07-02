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
