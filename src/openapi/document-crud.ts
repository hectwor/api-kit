import type { JoiLike } from "./joi-to-openapi";
import type { OpenApiRegistry } from "./registry";

export interface DocumentCrudOptions {
  registry: OpenApiRegistry;
  /** Base path, e.g. `"/api/v1/banks"`. */
  basePath: string;
  /** Tag / grouping name in Swagger UI, e.g. `"Banks"`. */
  tag: string;
  /** Component schema name for the resource DTO, e.g. `"Bank"`. */
  dtoName: string;
  /** Id route param. Default: `"id"`. */
  idParam?: string;
  /** Joi schema for the response DTO — registered as `{dtoName}`. */
  responseSchema?: JoiLike;
  /** Joi schema for POST body — registered as `{dtoName}Create`. */
  createSchema?: JoiLike;
  /** Joi schema for PUT body — registered as `{dtoName}Update`. */
  updateSchema?: JoiLike;
  /** Whether the resource is behind auth (adds bearer security). Default: `true`. */
  secured?: boolean;
  /** Include the `GET {basePath}/paginated` operation. Default: `false`. */
  paginated?: boolean;
}

/**
 * Emit the standard CRUD operations for a resource into the registry, deriving
 * request/response bodies from the same Joi schemas used for validation. Pair
 * with `registerCrudRoutes` so routes and docs come from one source.
 */
export function documentCrudResource(options: DocumentCrudOptions): void {
  const { registry, basePath, tag, dtoName } = options;
  const idParam = options.idParam ?? "id";
  const secured = options.secured ?? true;
  const idPath = `${basePath}/:${idParam}`;
  const dtoRef = dtoName;
  const createRef = `${dtoName}Create`;
  const updateRef = `${dtoName}Update`;

  if (options.responseSchema) registry.addSchema(dtoRef, options.responseSchema);
  if (options.createSchema) registry.addSchema(createRef, options.createSchema);
  if (options.updateSchema) registry.addSchema(updateRef, options.updateSchema);
  if (secured) registry.enableBearerAuth();

  const dtoResponse = (code: string, description: string) => ({
    [code]: { description, ...(registry.hasSchema(dtoRef) ? { schema: dtoRef } : {}) },
  });
  const idParamSpec = [{ name: idParam, in: "path" as const, required: true, schema: { type: "string" } }];

  registry.addPath({
    method: "get",
    path: basePath,
    tags: [tag],
    summary: `List ${tag}`,
    security: secured,
    responses: { "200": { description: `Array of ${dtoName}` } },
  });

  if (options.paginated) {
    registry.addPath({
      method: "get",
      path: `${basePath}/paginated`,
      tags: [tag],
      summary: `Paginated ${tag}`,
      security: secured,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      responses: { "200": { description: `Page of ${dtoName}` } },
    });
  }

  registry.addPath({
    method: "post",
    path: basePath,
    tags: [tag],
    summary: `Create ${dtoName}`,
    security: secured,
    ...(registry.hasSchema(createRef) && { requestBody: createRef }),
    responses: dtoResponse("201", `${dtoName} created`),
  });

  registry.addPath({
    method: "get",
    path: idPath,
    tags: [tag],
    summary: `Get ${dtoName} by id`,
    security: secured,
    parameters: idParamSpec,
    responses: { ...dtoResponse("200", dtoName), "404": { description: "Not found" } },
  });

  registry.addPath({
    method: "put",
    path: idPath,
    tags: [tag],
    summary: `Update ${dtoName}`,
    security: secured,
    parameters: idParamSpec,
    ...(registry.hasSchema(updateRef) && { requestBody: updateRef }),
    responses: { ...dtoResponse("200", `${dtoName} updated`), "404": { description: "Not found" } },
  });

  registry.addPath({
    method: "delete",
    path: idPath,
    tags: [tag],
    summary: `Delete ${dtoName}`,
    security: secured,
    parameters: idParamSpec,
    responses: { "200": { description: `${dtoName} deleted` }, "404": { description: "Not found" } },
  });
}
