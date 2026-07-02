export type ParameterDataType = "STRING" | "NUMBER" | "DECIMAL" | "BOOLEAN";

export interface ParameterValueEntity {
  id?: string;
  attrKey: string;
  attrValue: string;
  dataType: ParameterDataType;
  active?: boolean;
}

export interface ParameterNodeEntity {
  id?: string;
  code: string;
  name: string;
  sortOrder: number;
  active?: boolean;
  values: ParameterValueEntity[];
}

export interface ParameterGroupEntity {
  id?: string;
  code: string;
  name: string;
  description?: string;
  active?: boolean;
  parameters: ParameterNodeEntity[];
}

// ── CRUD input shapes ─────────────────────────────────────────────────────────

export interface CreateGroupInput {
  code: string;
  name: string;
  description?: string;
  active?: boolean;
}

export interface UpdateGroupInput {
  code?: string;
  name?: string;
  description?: string;
  active?: boolean;
}

export interface CreateNodeInput {
  code: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
  createdBy?: string;
  values?: ParameterValueEntity[];
}

export interface UpdateNodeInput {
  code?: string;
  name?: string;
  sortOrder?: number;
  active?: boolean;
  updatedBy?: string;
}

export interface UpdateValueInput {
  attrKey?: string;
  attrValue?: string;
  dataType?: ParameterDataType;
  active?: boolean;
}

/**
 * Persistence contract. The app implements this with its own ORM/schema.
 */
export interface ParameterCatalogRepository {
  // ── reads (trees) ──────────────────────────────────────────────────────────
  /** Full group tree (group -> parameters -> values) by group code, active rows only. */
  findGroupTree(groupCode: string): Promise<ParameterGroupEntity | null>;
  /** Full group tree by id, active rows only. */
  findGroupTreeById(groupId: string): Promise<ParameterGroupEntity | null>;
  /** All active group trees. */
  findAllGroupTrees(): Promise<ParameterGroupEntity[]>;
  /** Single parameter node with its values, by group code + node code. */
  findNode(groupCode: string, nodeCode: string): Promise<ParameterNodeEntity | null>;
  /** Resolve a parameter node id by group code + node code (null if missing). */
  findNodeId(groupCode: string, nodeCode: string): Promise<string | null>;

  // ── groups CRUD ────────────────────────────────────────────────────────────
  createGroup(input: CreateGroupInput): Promise<ParameterGroupEntity>;
  updateGroup(id: string, input: UpdateGroupInput): Promise<ParameterGroupEntity | null>;
  deleteGroup(id: string): Promise<void>;

  // ── parameter nodes CRUD ───────────────────────────────────────────────────
  findNodesByGroup(groupId: string): Promise<ParameterNodeEntity[]>;
  findNodeById(id: string): Promise<ParameterNodeEntity | null>;
  createNode(groupId: string, input: CreateNodeInput): Promise<ParameterNodeEntity>;
  updateNode(id: string, input: UpdateNodeInput): Promise<ParameterNodeEntity | null>;
  deleteNode(id: string): Promise<void>;

  // ── values CRUD ────────────────────────────────────────────────────────────
  findValueById(id: string): Promise<ParameterValueEntity | null>;
  createValue(parameterId: string, value: ParameterValueEntity): Promise<ParameterValueEntity>;
  /** Upsert a value attribute on an existing parameter node (by parameterId + attrKey). */
  upsertValue(parameterId: string, value: ParameterValueEntity): Promise<ParameterValueEntity>;
  updateValue(id: string, input: UpdateValueInput): Promise<ParameterValueEntity | null>;
  deleteValue(id: string): Promise<void>;
}

/**
 * Reduce a node's typed values into a plain `{ key: value }` object, coercing
 * each attribute by its declared data type.
 */
export function nodeValuesToObject(node: ParameterNodeEntity): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const v of node.values) {
    if (v.active === false) continue;
    result[v.attrKey] = coerceValue(v.attrValue, v.dataType);
  }
  return result;
}

export function coerceValue(raw: string, dataType: ParameterDataType): string | number | boolean {
  switch (dataType) {
    case "NUMBER":
    case "DECIMAL":
      return Number(raw);
    case "BOOLEAN":
      return raw === "true";
    default:
      return raw;
  }
}
