import { isJoiLike, joiToOpenApi, type JoiLike, type OpenApiSchema } from "./joi-to-openapi";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OperationParam {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OperationResponse {
  description: string;
  /** Component schema name (`#/components/schemas/{ref}`) or inline schema. */
  schema?: string | OpenApiSchema;
}

export interface AddPathOptions {
  method: HttpMethod;
  /** Express-style path; `:id` is normalised to `{id}`. */
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OperationParam[];
  /** Request body: component schema name or inline schema. */
  requestBody?: string | OpenApiSchema;
  responses?: Record<string, OperationResponse>;
  security?: boolean;
}

interface StoredOperation extends Omit<AddPathOptions, "path"> {}

const SCHEMA_REF = "#/components/schemas/";

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Collects schemas and operations, then assembles an OpenAPI 3.0 document.
 *
 * The document is built lazily in {@link build}, so serving it per-request
 * always reflects whatever routes/schemas were registered — no static file to
 * keep in sync.
 */
export class OpenApiRegistry {
  private readonly schemas = new Map<string, OpenApiSchema>();
  private readonly paths = new Map<string, Map<HttpMethod, StoredOperation>>();
  private securityScheme = false;

  constructor(private readonly info: OpenApiInfo) {}

  /** Register a reusable component schema from a Joi schema or a raw object. */
  addSchema(name: string, schema: JoiLike | OpenApiSchema): this {
    this.schemas.set(name, isJoiLike(schema) ? joiToOpenApi(schema) : schema);
    return this;
  }

  hasSchema(name: string): boolean {
    return this.schemas.has(name);
  }

  /** Enable a bearer (JWT) security scheme referenced by secured operations. */
  enableBearerAuth(): this {
    this.securityScheme = true;
    return this;
  }

  /** Register a single operation. Later calls override the same method+path. */
  addPath(options: AddPathOptions): this {
    const key = toOpenApiPath(options.path);
    if (!this.paths.has(key)) this.paths.set(key, new Map());
    const { path: _path, ...op } = options;
    this.paths.get(key)!.set(options.method, op);
    if (options.security) this.securityScheme = true;
    return this;
  }

  /** True when method+path is already documented (used to skip introspected dupes). */
  hasPath(method: HttpMethod, path: string): boolean {
    return this.paths.get(toOpenApiPath(path))?.has(method) ?? false;
  }

  private resolveBody(body: string | OpenApiSchema) {
    const schema = typeof body === "string" ? { $ref: `${SCHEMA_REF}${body}` } : body;
    return { required: true, content: { "application/json": { schema } } };
  }

  private resolveResponse(res: OperationResponse) {
    if (!res.schema) return { description: res.description };
    const schema = typeof res.schema === "string" ? { $ref: `${SCHEMA_REF}${res.schema}` } : res.schema;
    return { description: res.description, content: { "application/json": { schema } } };
  }

  /** Assemble the full OpenAPI 3.0 document. */
  build(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [path, methods] of this.paths) {
      paths[path] = {};
      for (const [method, op] of methods) {
        const responses: Record<string, unknown> = {};
        for (const [code, res] of Object.entries(op.responses ?? { "200": { description: "OK" } })) {
          responses[code] = this.resolveResponse(res);
        }
        paths[path][method] = {
          ...(op.summary && { summary: op.summary }),
          ...(op.description && { description: op.description }),
          ...(op.tags && { tags: op.tags }),
          ...(op.parameters && { parameters: op.parameters }),
          ...(op.requestBody && { requestBody: this.resolveBody(op.requestBody) }),
          ...(op.security && this.securityScheme && { security: [{ bearerAuth: [] }] }),
          responses,
        };
      }
    }

    const components: Record<string, unknown> = {
      schemas: Object.fromEntries(this.schemas),
    };
    if (this.securityScheme) {
      components.securitySchemes = { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } };
    }

    return {
      openapi: "3.0.3",
      info: this.info,
      paths,
      components,
    };
  }
}
