/**
 * Convert a Joi schema to an OpenAPI 3.0 Schema Object.
 *
 * Operates on the output of `schema.describe()`, so Joi is never imported at
 * runtime (it stays an optional peer dependency). Covers the constructs used in
 * request/response DTOs: objects, strings (with formats), numbers, booleans,
 * arrays, dates, enums, defaults, descriptions and alternatives.
 */

/** Minimal structural type for anything with a Joi-style `describe()`. */
export interface JoiLike {
  describe(): JoiDescription;
}

export interface JoiDescription {
  type?: string;
  flags?: {
    presence?: string;
    default?: unknown;
    description?: string;
    only?: boolean;
    label?: string;
  };
  keys?: Record<string, JoiDescription>;
  items?: JoiDescription[];
  matches?: Array<{ schema?: JoiDescription }>;
  allow?: unknown[];
  rules?: Array<{ name: string; args?: Record<string, unknown> }>;
  metas?: Array<Record<string, unknown>>;
}

export interface OpenApiSchema {
  type?: string;
  format?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  oneOf?: OpenApiSchema[];
  example?: unknown;
}

export function isJoiLike(value: unknown): value is JoiLike {
  return typeof value === "object" && value !== null && typeof (value as JoiLike).describe === "function";
}

function hasRule(desc: JoiDescription, name: string): boolean {
  return desc.rules?.some((r) => r.name === name) ?? false;
}

function rule(desc: JoiDescription, name: string): Record<string, unknown> | undefined {
  return desc.rules?.find((r) => r.name === name)?.args;
}

function applyStringRules(desc: JoiDescription, out: OpenApiSchema): void {
  if (hasRule(desc, "email")) out.format = "email";
  if (hasRule(desc, "uri")) out.format = "uri";
  if (hasRule(desc, "guid") || hasRule(desc, "uuid")) out.format = "uuid";
  if (hasRule(desc, "isoDate")) out.format = "date-time";
  const min = rule(desc, "min");
  const max = rule(desc, "max");
  const len = rule(desc, "length");
  if (min && typeof min.limit === "number") out.minLength = min.limit;
  if (max && typeof max.limit === "number") out.maxLength = max.limit;
  if (len && typeof len.limit === "number") {
    out.minLength = len.limit;
    out.maxLength = len.limit;
  }
}

function applyNumberRules(desc: JoiDescription, out: OpenApiSchema): void {
  if (hasRule(desc, "integer")) out.type = "integer";
  const min = rule(desc, "min");
  const max = rule(desc, "max");
  if (min && typeof min.limit === "number") out.minimum = min.limit;
  if (max && typeof max.limit === "number") out.maximum = max.limit;
}

/** Convert a `describe()` output node to an OpenAPI schema. */
export function describeToOpenApi(desc: JoiDescription): OpenApiSchema {
  const out: OpenApiSchema = {};
  if (desc.flags?.description) out.description = desc.flags.description;
  if (desc.flags?.default !== undefined && typeof desc.flags.default !== "function") {
    out.default = desc.flags.default;
  }

  // Enum: `.valid(...)` sets flags.only and lists the allowed values.
  const allowed = (desc.allow ?? []).filter((v) => v !== null);
  if (desc.flags?.only && allowed.length > 0) {
    out.enum = allowed;
  }
  if ((desc.allow ?? []).includes(null)) out.nullable = true;

  switch (desc.type) {
    case "object": {
      out.type = "object";
      const props: Record<string, OpenApiSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(desc.keys ?? {})) {
        props[key] = describeToOpenApi(child);
        if (child.flags?.presence === "required") required.push(key);
      }
      out.properties = props;
      if (required.length > 0) out.required = required;
      break;
    }
    case "array": {
      out.type = "array";
      out.items = desc.items?.[0] ? describeToOpenApi(desc.items[0]) : {};
      const min = rule(desc, "min");
      const max = rule(desc, "max");
      if (min && typeof min.limit === "number") out.minItems = min.limit;
      if (max && typeof max.limit === "number") out.maxItems = max.limit;
      break;
    }
    case "string":
      out.type = "string";
      applyStringRules(desc, out);
      break;
    case "number":
      out.type = "number";
      applyNumberRules(desc, out);
      break;
    case "boolean":
      out.type = "boolean";
      break;
    case "date":
      out.type = "string";
      out.format = "date-time";
      break;
    case "alternatives":
      out.oneOf = (desc.matches ?? []).map((m) => (m.schema ? describeToOpenApi(m.schema) : {}));
      break;
    default:
      // any / unknown → leave untyped (matches anything)
      break;
  }

  return out;
}

/** Convert a Joi schema (or an already-described node) to an OpenAPI schema. */
export function joiToOpenApi(schema: JoiLike | JoiDescription): OpenApiSchema {
  const desc = isJoiLike(schema) ? schema.describe() : schema;
  return describeToOpenApi(desc);
}
