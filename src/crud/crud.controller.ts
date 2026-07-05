import type express from "express";

import type { RequireUserId } from "../auth/request-user";
import { SUCCESS_CODES, ERROR_CODES } from "../http/codes";
import type { ResponseBuilder } from "../http/response-builder";
import { paginatedData, parsePagination, type ParsePaginationOptions } from "../http/pagination";

import type { BaseEntity, EntityToDTO, PageResult } from "./crud.types";
import { parseListQuery, type ListQuery, type ParseListQueryOptions } from "./list-query";

/**
 * Minimal service surface the controller depends on. `CrudService` satisfies it,
 * but so does any hand-written service with the same shape — so an app can adopt
 * the generic controller without rebuilding its service layer. `deleteById`
 * returns `unknown` (truthy = success) to accept both boolean and entity returns.
 */
export interface CrudServiceLike<E extends BaseEntity> {
  all(userId?: string, query?: ListQuery): Promise<E[]>;
  paginated?(userId: string | undefined, page: number, limit: number, query?: ListQuery): Promise<PageResult<E>>;
  readById(id: string, userId?: string): Promise<E | null>;
  create(entity: E): Promise<E>;
  updateById(id: string, entity: Partial<E>, userId?: string): Promise<E | null>;
  deleteById(id: string, userId?: string): Promise<unknown>;
}

/** Per-action HTTP status overrides (defaults: reads/update/delete 200, create 201). */
export interface CrudStatusOverrides {
  list?: number;
  paginated?: number;
  getById?: number;
  create?: number;
  update?: number;
  remove?: number;
}

export interface CrudControllerConfig<E extends BaseEntity, DTO = E> {
  /** Human name used only in the 404 error message (e.g. `"Bank"`). */
  resource: string;
  service: CrudServiceLike<E>;
  /** Response builder from the app's kit. */
  responses: ResponseBuilder;
  /** Guard from the app's kit. */
  requireUserId: RequireUserId;
  /** Entity → DTO projection. Omit to return entities unchanged. */
  toDTO?: EntityToDTO<E, DTO>;
  /** Route param holding the id. Default: `"id"`. */
  idParam?: string;
  /** Pagination bounds for the `paginated` handler. */
  pagination?: ParsePaginationOptions;
  /**
   * Filtering/sorting/search allow-list for `list` and `paginated`. When omitted,
   * query params are ignored (all rows returned). Only listed fields are honoured.
   */
  listQuery?: ParseListQueryOptions;
  /** Override the success status code per action (e.g. `create: 200`). */
  status?: CrudStatusOverrides;
  /**
   * Body of a successful DELETE. Receives the delete result (entity when the
   * service returns one) and the id. Default: `{ id }`.
   */
  deletePayload?: (deleted: unknown, id: string) => unknown;
}

export interface CrudController {
  /** GET / — all rows for the caller. */
  list: express.RequestHandler;
  /** GET /paginated — page of rows for the caller. */
  paginated: express.RequestHandler;
  /** GET /:id — single owned row (404 when absent). */
  getById: express.RequestHandler;
  /** POST / — create, stamping ownership from the token. */
  create: express.RequestHandler;
  /** PUT /:id — update an owned row (404 when absent). */
  update: express.RequestHandler;
  /** DELETE /:id — remove an owned row (404 when absent). */
  remove: express.RequestHandler;
}

/**
 * Build the five standard REST handlers for a user-scoped resource.
 *
 * Mirrors the hand-written controllers: `requireUserId` guard → service call →
 * DTO projection → standardized envelope. Ownership is enforced in the service.
 */
export function createCrudController<E extends BaseEntity, DTO = E>(
  config: CrudControllerConfig<E, DTO>,
): CrudController {
  const { resource, service, responses, requireUserId } = config;
  const idParam = config.idParam ?? "id";
  const status = config.status ?? {};
  const project = (entity: E): DTO | E => (config.toDTO ? config.toDTO(entity) : entity);
  const deletePayload = config.deletePayload ?? ((_deleted: unknown, id: string) => ({ id }));
  const text = (key: string): string => responses.messages[key] ?? key;
  const listQuery = (req: express.Request) =>
    config.listQuery ? parseListQuery(req.query as Record<string, unknown>, config.listQuery) : undefined;
  const notFound = (res: express.Response) =>
    responses.sendError(res, ERROR_CODES.NOT_FOUND, `${resource} not found or does not belong to user`, 404);

  return {
    list: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const items = await service.all(userId, listQuery(req));
      responses.sendSuccess(res, items.map(project), SUCCESS_CODES.LISTED, text("LISTED"), status.list ?? 200);
    },

    paginated: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      if (!service.paginated) throw new Error(`${resource} service does not implement paginated()`);
      const { page, limit } = parsePagination(req.query as Record<string, unknown>, config.pagination);
      const { items, total } = await service.paginated(userId, page, limit, listQuery(req));
      const payload = paginatedData(items.map(project), page, limit, total);
      responses.sendSuccess(res, payload, SUCCESS_CODES.LISTED, text("LISTED"), status.paginated ?? 200);
    },

    getById: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const entity = await service.readById(req.params[idParam], userId);
      if (!entity) return notFound(res);
      responses.sendSuccess(res, project(entity), SUCCESS_CODES.RETRIEVED, text("RETRIEVED"), status.getById ?? 200);
    },

    create: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const created = await service.create({ ...req.body, userId, createdBy: userId } as E);
      responses.sendSuccess(res, project(created), SUCCESS_CODES.CREATED, text("CREATED"), status.create ?? 201);
    },

    update: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const updated = await service.updateById(req.params[idParam], { ...req.body, updatedBy: userId } as Partial<E>, userId);
      if (!updated) return notFound(res);
      responses.sendSuccess(res, project(updated), SUCCESS_CODES.UPDATED, text("UPDATED"), status.update ?? 200);
    },

    remove: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const id = req.params[idParam];
      const deleted = await service.deleteById(id, userId);
      if (!deleted) return notFound(res);
      responses.sendSuccess(res, deletePayload(deleted, id), SUCCESS_CODES.DELETED, text("DELETED"), status.remove ?? 200);
    },
  };
}
