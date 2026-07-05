import { BusinessError } from "../errors";

import type { BaseEntity, RowMapper } from "../crud/crud.types";

/**
 * How one domain field maps to a persistence column. A bare string is the
 * common case: a 1:1 bidirectional mapping with `null`→`undefined` coercion on
 * read. The object form covers the recurring edge behaviours every hand-written
 * mapper re-implements (defaults, optional writes, create-only fields, columns
 * the DB owns, and value transforms).
 */
export type ColumnSpec<V = unknown> =
  | string
  | {
      /** Persistence column name. */
      column: string;
      /** On write, emit the column only when the value is not `undefined`. */
      optional?: boolean;
      /** Field default: substituted whenever the value is `undefined`, on both read and create. */
      default?: V;
      /**
       * Create-only default, applied when the value is `undefined` on create but
       * NOT on read. A function receives the whole entity, so a field can derive
       * from another (e.g. `createdBy` ← `userId`: `(e) => e.userId`).
       */
      createDefault?: V | ((entity: Record<string, unknown>) => V);
      /** Read-only default, applied in `toDomain` when the column is null/absent, but not on write. */
      readDefault?: V;
      /**
       * On create, throw `INVALID_INPUT` (400) when the value is missing (undefined,
       * null, or a blank string). `true` uses the message `"<entityName> <field> is
       * required"`; pass a string to override it (e.g. to name the DB column).
       */
      requiredOnCreate?: boolean | string;
      /** Present in `toDomain` but never written (DB-managed, e.g. timestamps). */
      readOnly?: boolean;
      /** Written on create, ignored on update (e.g. `userId`, `createdBy`). */
      immutable?: boolean;
      /** Written on update, never on create (the mirror of `immutable`, e.g. an `updatedBy` a create never stamps). */
      updateOnly?: boolean;
      /**
       * Computed value written on EVERY update and never on create — the
       * auto-touch idiom, e.g. `updatedAt: { column: "updated_at", onUpdate: () => new Date() }`.
       * Read still maps the column normally.
       */
      onUpdate?: () => unknown;
      /** On update, skip the column when the value is an empty/whitespace-only string (audit-field guard). */
      skipEmpty?: boolean;
      /** On read, preserve a `null` column as `null` instead of coercing it to `undefined`. */
      keepNull?: boolean;
      /** Value transforms across the domain⇄column boundary. */
      transform?: {
        toDomain?: (columnValue: unknown) => V;
        toColumn?: (entityValue: V) => unknown;
      };
    };

export interface EntityMapperConfig<E extends BaseEntity> {
  /**
   * One entry per domain field. Fields with no entry are ignored entirely.
   * Typing each spec as `ColumnSpec<E[K]>` keeps `default`/`createDefault`/etc.
   * bound to the field's type and lets function defaults infer their param.
   */
  columns: { [K in keyof E]?: ColumnSpec<E[K]> };
  /**
   * Domain field carrying the primary key. Default `"id"`. On create it is
   * emitted only when truthy — so a DB-generated UUID default is used unless the
   * client supplied one (offline-sync safe; avoids the "non-UUID id" class of bug).
   */
  idKey?: keyof E;
  /** Human name used in the `requiredOnCreate` error message. Default `"Entity"`. */
  entityName?: string;
}

interface NormalizedSpec {
  column: string;
  optional: boolean;
  hasDefault: boolean;
  default?: unknown;
  hasCreateDefault: boolean;
  createDefault?: unknown | ((entity: Record<string, unknown>) => unknown);
  hasReadDefault: boolean;
  readDefault?: unknown;
  requiredOnCreate: boolean;
  requiredMessage?: string;
  readOnly: boolean;
  immutable: boolean;
  updateOnly: boolean;
  skipEmpty: boolean;
  keepNull: boolean;
  onUpdate?: () => unknown;
  toDomain?: (v: unknown) => unknown;
  toColumn?: (v: unknown) => unknown;
}

function normalize(spec: ColumnSpec): NormalizedSpec {
  if (typeof spec === "string") {
    return {
      column: spec,
      optional: false,
      hasDefault: false,
      hasCreateDefault: false,
      hasReadDefault: false,
      requiredOnCreate: false,
      readOnly: false,
      immutable: false,
      updateOnly: false,
      skipEmpty: false,
      keepNull: false,
    };
  }
  return {
    column: spec.column,
    optional: spec.optional ?? false,
    hasDefault: "default" in spec,
    default: spec.default,
    hasCreateDefault: "createDefault" in spec,
    createDefault: spec.createDefault,
    hasReadDefault: "readDefault" in spec,
    readDefault: spec.readDefault,
    requiredOnCreate: Boolean(spec.requiredOnCreate),
    requiredMessage: typeof spec.requiredOnCreate === "string" ? spec.requiredOnCreate : undefined,
    readOnly: spec.readOnly ?? false,
    immutable: spec.immutable ?? false,
    updateOnly: spec.updateOnly ?? false,
    skipEmpty: spec.skipEmpty ?? false,
    keepNull: spec.keepNull ?? false,
    onUpdate: spec.onUpdate,
    toDomain: spec.transform?.toDomain as ((v: unknown) => unknown) | undefined,
    toColumn: spec.transform?.toColumn as ((v: unknown) => unknown) | undefined,
  };
}

/** True for an empty or whitespace-only string. */
function isBlankString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length === 0;
}

/**
 * Build a declarative {@link RowMapper} from a domain⇄column field map, replacing
 * the hand-written `toDomain` / `toCreateInput` / `toUpdateInput` trio each model
 * otherwise duplicates.
 *
 *   const mapper = createEntityMapper<CategoryEntity>({
 *     entityName: "Category",
 *     columns: {
 *       id: "id",
 *       name: "display_name",
 *       iconEmoji: { column: "icon_emoji", optional: true },
 *       status: { column: "status", default: "active" },
 *       userId: { column: "user_id", requiredOnCreate: true, immutable: true },
 *       createdBy: { column: "created_by", immutable: true },
 *       updatedBy: "updated_by",
 *       createdAt: { column: "created_at", readOnly: true },
 *       updatedAt: { column: "updated_at", readOnly: true },
 *     },
 *   });
 *
 * The result plugs straight into `SoftDeleteUserScopedRepository` (it *is* a
 * `RowMapper`) or can back a standalone Prisma repository.
 *
 * Semantics per field:
 * - `toDomain`   — read `row[column]`, coerce `null`→`undefined`, apply `transform.toDomain`.
 * - `toCreateInput` — skip `readOnly`; the id key is emitted only when truthy;
 *   `requiredOnCreate` throws when missing; `default` fills an `undefined`;
 *   `optional` skips an `undefined`; otherwise the value (possibly `undefined`) is written.
 * - `toUpdateInput` — skip `readOnly`, `immutable`, and the id key; emit a column
 *   only when its value is not `undefined` (partial-update semantics).
 */
export function createEntityMapper<E extends BaseEntity, Row = Record<string, unknown>>(
  config: EntityMapperConfig<E>,
): RowMapper<E, Row> {
  const idKey = (config.idKey ?? "id") as keyof E;
  const entityName = config.entityName ?? "Entity";
  const entries = (Object.keys(config.columns) as Array<keyof E>)
    .filter((key) => config.columns[key] !== undefined)
    .map((key) => [key, normalize(config.columns[key] as ColumnSpec)] as const);

  return {
    toDomain(row: Row): E {
      const src = row as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, spec] of entries) {
        const raw = src[spec.column];
        let value = spec.toDomain ? spec.toDomain(raw) : spec.keepNull ? raw : (raw ?? undefined);
        if (value === undefined && spec.hasReadDefault) value = spec.readDefault; // read-only default
        if (value === undefined && spec.hasDefault) value = spec.default; // unified default applies on read too
        out[key as string] = value;
      }
      return out as E;
    },

    toCreateInput(entity: E): Record<string, unknown> {
      const src = entity as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, spec] of entries) {
        if (spec.readOnly || spec.updateOnly || spec.onUpdate) continue; // onUpdate columns are update-only
        const raw = src[key as string];

        if (key === idKey) {
          if (raw) out[spec.column] = spec.toColumn ? spec.toColumn(raw) : raw; // honour client UUID only when present
          continue;
        }

        let value = raw;
        if (value === undefined && spec.hasCreateDefault) {
          value = typeof spec.createDefault === "function" ? (spec.createDefault as (e: Record<string, unknown>) => unknown)(src) : spec.createDefault;
        }
        if (value === undefined && spec.hasDefault) value = spec.default;
        if (spec.requiredOnCreate && (value === undefined || value === null || isBlankString(value))) {
          throw new BusinessError(spec.requiredMessage ?? `${entityName} ${String(key)} is required`, 400, "INVALID_INPUT", "INVALID_INPUT");
        }
        if (value === undefined && spec.optional) continue;
        out[spec.column] = spec.toColumn ? spec.toColumn(value) : value;
      }
      return out;
    },

    toUpdateInput(entity: Partial<E>): Record<string, unknown> {
      const src = entity as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, spec] of entries) {
        if (spec.readOnly || spec.immutable || key === idKey) continue;
        if (spec.onUpdate) {
          out[spec.column] = spec.onUpdate(); // computed auto-touch, always written
          continue;
        }
        const raw = src[key as string];
        if (raw === undefined) continue; // partial: only touch provided fields
        if (spec.skipEmpty && isBlankString(raw)) continue; // audit-field guard: don't blank-out on update
        out[spec.column] = spec.toColumn ? spec.toColumn(raw) : raw;
      }
      return out;
    },
  };
}
