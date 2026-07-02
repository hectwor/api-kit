import { describe, expect, it, vi } from "vitest";

import { ParameterCatalogService } from "../src/modules/parameter-catalog/parameter-catalog.service";
import { nodeValuesToObject, type ParameterCatalogRepository, type ParameterGroupEntity } from "../src/modules/parameter-catalog/parameter-catalog.types";

function fakeGroup(code: string): ParameterGroupEntity {
  return {
    code,
    name: code,
    parameters: [
      {
        code: "NODE_A",
        name: "Node A",
        sortOrder: 1,
        values: [
          { attrKey: "limit", attrValue: "5", dataType: "NUMBER" },
          { attrKey: "enabled", attrValue: "true", dataType: "BOOLEAN" },
          { attrKey: "label", attrValue: "hello", dataType: "STRING" },
          { attrKey: "off", attrValue: "x", dataType: "STRING", active: false },
        ],
      },
    ],
  };
}

function fakeRepo(overrides: Partial<ParameterCatalogRepository> = {}): ParameterCatalogRepository {
  return {
    findGroupTree: vi.fn((code: string) => Promise.resolve(fakeGroup(code))),
    findGroupTreeById: vi.fn(() => Promise.resolve(null)),
    findAllGroupTrees: vi.fn(() => Promise.resolve([])),
    findNode: vi.fn(() => Promise.resolve(null)),
    findNodeId: vi.fn(() => Promise.resolve(null)),
    createGroup: vi.fn((input) => Promise.resolve({ ...input, parameters: [] })),
    updateGroup: vi.fn(() => Promise.resolve(null)),
    deleteGroup: vi.fn(() => Promise.resolve()),
    findNodesByGroup: vi.fn(() => Promise.resolve([])),
    findNodeById: vi.fn(() => Promise.resolve(null)),
    createNode: vi.fn(() => Promise.resolve({ code: "n", name: "n", sortOrder: 0, values: [] })),
    updateNode: vi.fn(() => Promise.resolve(null)),
    deleteNode: vi.fn(() => Promise.resolve()),
    findValueById: vi.fn(() => Promise.resolve(null)),
    createValue: vi.fn((_, v) => Promise.resolve(v)),
    upsertValue: vi.fn((_, v) => Promise.resolve(v)),
    updateValue: vi.fn(() => Promise.resolve(null)),
    deleteValue: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("nodeValuesToObject", () => {
  it("coerces by data type and skips inactive values", () => {
    const obj = nodeValuesToObject(fakeGroup("G").parameters[0]);
    expect(obj).toEqual({ limit: 5, enabled: true, label: "hello" });
  });
});

describe("ParameterCatalogService cache", () => {
  it("caches group trees within TTL", async () => {
    const repo = fakeRepo();
    const service = new ParameterCatalogService(repo, { cacheTtlMs: 60_000 });
    await service.getGroupTree("G1");
    await service.getGroupTree("G1");
    expect(repo.findGroupTree).toHaveBeenCalledTimes(1);
  });

  it("reloads after TTL expiry", async () => {
    const repo = fakeRepo();
    const service = new ParameterCatalogService(repo, { cacheTtlMs: 1 });
    await service.getGroupTree("G1");
    await new Promise((r) => setTimeout(r, 5));
    await service.getGroupTree("G1");
    expect(repo.findGroupTree).toHaveBeenCalledTimes(2);
  });

  it("serves stale data when the repo errors", async () => {
    let calls = 0;
    const repo = fakeRepo({
      findGroupTree: vi.fn((code: string) => {
        calls += 1;
        return calls === 1 ? Promise.resolve(fakeGroup(code)) : Promise.reject(new Error("db down"));
      }),
    });
    const service = new ParameterCatalogService(repo, { cacheTtlMs: 1 });
    const first = await service.getGroupTree("G1");
    await new Promise((r) => setTimeout(r, 5));
    const second = await service.getGroupTree("G1");
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it("mutations invalidate the cache", async () => {
    const repo = fakeRepo();
    const service = new ParameterCatalogService(repo, { cacheTtlMs: 60_000 });
    await service.getGroupTree("G1");
    await service.createGroup({ code: "G2", name: "g2" });
    await service.getGroupTree("G1");
    expect(repo.findGroupTree).toHaveBeenCalledTimes(2);
  });

  it("is extensible via subclass with protected loadGroup", async () => {
    class MyCatalog extends ParameterCatalogService {
      async getLimits(): Promise<Record<string, string | number | boolean>> {
        const group = await this.loadGroup("LIMITS");
        return group ? nodeValuesToObject(group.parameters[0]) : {};
      }
    }
    const service = new MyCatalog(fakeRepo());
    expect(await service.getLimits()).toEqual({ limit: 5, enabled: true, label: "hello" });
  });
});
