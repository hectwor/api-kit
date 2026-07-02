import type {
  CreateGroupInput,
  CreateNodeInput,
  ParameterCatalogRepository,
  ParameterGroupEntity,
  ParameterNodeEntity,
  ParameterValueEntity,
  UpdateGroupInput,
  UpdateNodeInput,
  UpdateValueInput,
} from "./parameter-catalog.types";
import type { LoggerLike } from "../../logging/logger";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedGroup {
  data: ParameterGroupEntity | null;
  timestamp: number;
}

export interface ParameterCatalogServiceOptions {
  /** Group-tree cache TTL in milliseconds. Default: 5 minutes. */
  cacheTtlMs?: number;
  logger?: LoggerLike;
}

/**
 * Runtime parameter catalog: tree of groups → nodes → typed values, with a
 * TTL cache and stale-on-error fallback. Extend it (both `loadGroup` and
 * `findNode` are protected) to expose app-specific typed getters.
 */
export class ParameterCatalogService {
  private groupCache: Record<string, CachedGroup> = {};
  private readonly cacheTtlMs: number;
  protected readonly logger?: LoggerLike;

  constructor(
    protected readonly repo: ParameterCatalogRepository,
    options: ParameterCatalogServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.logger = options.logger;
  }

  // ── caching ────────────────────────────────────────────────────────────────

  protected async loadGroup(groupCode: string): Promise<ParameterGroupEntity | null> {
    const cached = this.groupCache[groupCode];
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }
    let data: ParameterGroupEntity | null = null;
    try {
      data = await this.repo.findGroupTree(groupCode);
    } catch (error) {
      this.logger?.error("[ParameterCatalog] Error loading group from DB", { groupCode, error });
      return cached?.data ?? null; // serve stale on error if available
    }
    this.groupCache[groupCode] = { data, timestamp: Date.now() };
    return data;
  }

  protected async findNode(groupCode: string, nodeCode: string): Promise<ParameterNodeEntity | null> {
    const group = await this.loadGroup(groupCode);
    return group?.parameters.find((p) => p.code === nodeCode) ?? null;
  }

  invalidateCache(): void {
    this.groupCache = {};
    this.logger?.debug("[ParameterCatalog] Cache invalidated");
  }

  // ── generic CRUD: groups ─────────────────────────────────────────────────────

  async listGroups(): Promise<ParameterGroupEntity[]> {
    return this.repo.findAllGroupTrees();
  }

  async getGroupById(id: string): Promise<ParameterGroupEntity | null> {
    return this.repo.findGroupTreeById(id);
  }

  async getGroupTree(groupCode: string): Promise<ParameterGroupEntity | null> {
    return this.loadGroup(groupCode);
  }

  async createGroup(input: CreateGroupInput): Promise<ParameterGroupEntity> {
    const created = await this.repo.createGroup(input);
    this.invalidateCache();
    return created;
  }

  async updateGroup(id: string, input: UpdateGroupInput): Promise<ParameterGroupEntity | null> {
    const updated = await this.repo.updateGroup(id, input);
    this.invalidateCache();
    return updated;
  }

  async deleteGroup(id: string): Promise<void> {
    await this.repo.deleteGroup(id);
    this.invalidateCache();
  }

  // ── generic CRUD: parameter nodes ────────────────────────────────────────────

  async listNodesByGroup(groupId: string): Promise<ParameterNodeEntity[]> {
    return this.repo.findNodesByGroup(groupId);
  }

  async getNodeById(id: string): Promise<ParameterNodeEntity | null> {
    return this.repo.findNodeById(id);
  }

  async createNode(groupId: string, input: CreateNodeInput): Promise<ParameterNodeEntity> {
    const created = await this.repo.createNode(groupId, input);
    this.invalidateCache();
    return created;
  }

  async updateNode(id: string, input: UpdateNodeInput): Promise<ParameterNodeEntity | null> {
    const updated = await this.repo.updateNode(id, input);
    this.invalidateCache();
    return updated;
  }

  async deleteNode(id: string): Promise<void> {
    await this.repo.deleteNode(id);
    this.invalidateCache();
  }

  // ── generic CRUD: values ─────────────────────────────────────────────────────

  async getValueById(id: string): Promise<ParameterValueEntity | null> {
    return this.repo.findValueById(id);
  }

  async createValue(parameterId: string, value: ParameterValueEntity): Promise<ParameterValueEntity> {
    const created = await this.repo.createValue(parameterId, value);
    this.invalidateCache();
    return created;
  }

  async updateValue(id: string, input: UpdateValueInput): Promise<ParameterValueEntity | null> {
    const updated = await this.repo.updateValue(id, input);
    this.invalidateCache();
    return updated;
  }

  async deleteValue(id: string): Promise<void> {
    await this.repo.deleteValue(id);
    this.invalidateCache();
  }
}
