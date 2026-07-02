import type express from "express";

import type { RequireUserId } from "../auth/request-user";
import { SUCCESS_CODES, ERROR_CODES } from "../http/codes";
import type { ResponseBuilder } from "../http/response-builder";
import { paginatedData, parsePagination, type ParsePaginationOptions } from "../http/pagination";

import type { CrudService } from "./crud.service";
import type { BaseEntity, EntityToDTO } from "./crud.types";

export interface CrudControllerConfig<E extends BaseEntity, DTO = E> {
  /** Human name used only in the 404 error message (e.g. `"Bank"`). */
  resource: string;
  service: CrudService<E>;
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
  const project = (entity: E): DTO | E => (config.toDTO ? config.toDTO(entity) : entity);
  const text = (key: string): string => responses.messages[key] ?? key;
  const notFound = (res: express.Response) =>
    responses.sendError(res, ERROR_CODES.NOT_FOUND, `${resource} not found or does not belong to user`, 404);

  return {
    list: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const items = await service.all(userId);
      responses.sendSuccess(res, items.map(project), SUCCESS_CODES.LISTED, text("LISTED"), 200);
    },

    paginated: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const { page, limit } = parsePagination(req.query as Record<string, unknown>, config.pagination);
      const { items, total } = await service.paginated(userId, page, limit);
      const payload = paginatedData(items.map(project), page, limit, total);
      responses.sendSuccess(res, payload, SUCCESS_CODES.LISTED, text("LISTED"), 200);
    },

    getById: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const entity = await service.readById(req.params[idParam], userId);
      if (!entity) return notFound(res);
      responses.sendSuccess(res, project(entity), SUCCESS_CODES.RETRIEVED, text("RETRIEVED"), 200);
    },

    create: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const created = await service.create({ ...req.body, userId, createdBy: userId } as E);
      responses.sendSuccess(res, project(created), SUCCESS_CODES.CREATED, text("CREATED"), 201);
    },

    update: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const updated = await service.updateById(req.params[idParam], { ...req.body, updatedBy: userId } as Partial<E>, userId);
      if (!updated) return notFound(res);
      responses.sendSuccess(res, project(updated), SUCCESS_CODES.UPDATED, text("UPDATED"), 200);
    },

    remove: async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const deleted = await service.deleteById(req.params[idParam], userId);
      if (!deleted) return notFound(res);
      responses.sendSuccess(res, { id: req.params[idParam] }, SUCCESS_CODES.DELETED, text("DELETED"), 200);
    },
  };
}
