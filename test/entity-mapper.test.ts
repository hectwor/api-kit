import { describe, expect, it } from "vitest";

import { createEntityMapper } from "../src/mapping";

interface Category {
  id?: string;
  name?: string;
  iconEmoji?: string;
  status?: string;
  userId?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

const mapper = createEntityMapper<Category>({
  entityName: "Category",
  columns: {
    id: "id",
    name: "display_name",
    iconEmoji: { column: "icon_emoji", optional: true },
    status: { column: "status", default: "active" },
    userId: { column: "user_id", requiredOnCreate: true, immutable: true },
    createdBy: { column: "created_by", immutable: true },
    updatedBy: "updated_by",
    createdAt: { column: "created_at", readOnly: true },
    updatedAt: { column: "updated_at", readOnly: true },
  },
});

describe("createEntityMapper toDomain", () => {
  it("maps columns to domain fields and coerces null to undefined", () => {
    const domain = mapper.toDomain({
      id: "c1",
      display_name: "Food",
      icon_emoji: null,
      status: "active",
      user_id: "u1",
      created_by: "u1",
      updated_by: null,
      created_at: new Date("2020-01-01"),
      updated_at: null,
    });
    expect(domain).toMatchObject({ id: "c1", name: "Food", userId: "u1", createdBy: "u1", status: "active" });
    expect(domain.iconEmoji).toBeUndefined();
    expect(domain.updatedBy).toBeUndefined();
    expect(domain.createdAt).toEqual(new Date("2020-01-01"));
  });

  it("applies a field default on read when the column is null/absent", () => {
    const domain = mapper.toDomain({ id: "c1", display_name: "Food", user_id: "u1", status: null });
    expect(domain.status).toBe("active");
  });
});

describe("createEntityMapper toCreateInput", () => {
  it("applies default, skips optional-undefined, and requires userId", () => {
    const input = mapper.toCreateInput({ name: "Food", userId: "u1", createdBy: "u1" });
    expect(input).toEqual({ display_name: "Food", status: "active", user_id: "u1", created_by: "u1" });
    // iconEmoji (optional) omitted; readOnly timestamps omitted; updatedBy undefined -> written as undefined
    expect("icon_emoji" in input).toBe(false);
    expect("created_at" in input).toBe(false);
  });

  it("throws INVALID_INPUT when a requiredOnCreate field is missing", () => {
    expect(() => mapper.toCreateInput({ name: "Food" })).toThrowError(/Category userId is required/);
  });

  it("emits the id column only when the entity carries a truthy id", () => {
    expect("id" in mapper.toCreateInput({ name: "x", userId: "u1" })).toBe(false);
    expect(mapper.toCreateInput({ id: "given", name: "x", userId: "u1" }).id).toBe("given");
  });
});

describe("createEntityMapper toUpdateInput", () => {
  it("emits only provided fields and never id, immutable, or readOnly columns", () => {
    const input = mapper.toUpdateInput({ id: "c1", name: "Drinks", userId: "u2", createdBy: "u2", updatedBy: "u9" });
    expect(input).toEqual({ display_name: "Drinks", updated_by: "u9" });
    expect("id" in input).toBe(false);
    expect("user_id" in input).toBe(false); // immutable
    expect("created_by" in input).toBe(false); // immutable
  });
});

describe("createEntityMapper default timing", () => {
  const m = createEntityMapper<{ id?: string; userId?: string; createdBy?: string; status?: string }>({
    entityName: "Audited",
    columns: {
      id: "id",
      userId: { column: "user_id", requiredOnCreate: true, skipEmpty: true },
      createdBy: { column: "created_by", createDefault: (e) => e.userId as string, requiredOnCreate: true, skipEmpty: true },
      status: { column: "status", readDefault: "active" },
    },
  });

  it("createDefault derives from another field on create but not on read", () => {
    expect(m.toCreateInput({ userId: "u1" }).created_by).toBe("u1"); // derived
    expect(m.toCreateInput({ userId: "u1", createdBy: "u2" }).created_by).toBe("u2"); // explicit wins
    expect(m.toDomain({ id: "x", user_id: "u1", created_by: null }).createdBy).toBeUndefined(); // no read default
  });

  it("readDefault applies on read only, create writes the raw value", () => {
    expect(m.toDomain({ id: "x", status: null }).status).toBe("active");
    expect("status" in m.toCreateInput({ userId: "u1" })).toBe(true); // status undefined -> written as undefined, no readDefault on create
    expect(m.toCreateInput({ userId: "u1" }).status).toBeUndefined();
  });

  it("skipEmpty drops whitespace-only strings on update", () => {
    expect(m.toUpdateInput({ userId: "  ", createdBy: "u9" })).toEqual({ created_by: "u9" });
    expect(m.toUpdateInput({ userId: "u2" })).toEqual({ user_id: "u2" });
  });

  it("updateOnly writes on update but never on create (mirror of immutable)", () => {
    const um = createEntityMapper<{ id?: string; updatedBy?: string }>({
      columns: { id: "id", updatedBy: { column: "updated_by", updateOnly: true } },
    });
    expect("updated_by" in um.toCreateInput({ id: "x", updatedBy: "u1" })).toBe(false); // excluded on create
    expect(um.toUpdateInput({ updatedBy: "u1" })).toEqual({ updated_by: "u1" }); // written on update
  });

  it("onUpdate stamps a computed value on every update and never on create", () => {
    const om = createEntityMapper<{ id?: string; name?: string; updatedAt?: Date | string }>({
      columns: { id: "id", name: "name", updatedAt: { column: "updated_at", onUpdate: () => "NOW" } },
    });
    expect("updated_at" in om.toCreateInput({ id: "x", name: "a" })).toBe(false);
    expect(om.toUpdateInput({ name: "b" })).toEqual({ name: "b", updated_at: "NOW" }); // always stamped
    expect(om.toDomain({ id: "x", name: "a", updated_at: "2020" }).updatedAt).toBe("2020"); // read still maps
  });

  it("requiredOnCreate rejects blank/whitespace strings, not just undefined", () => {
    expect(() => mapper.toCreateInput({ name: "x", userId: "  " })).toThrowError(/Category userId is required/);
  });

  it("keepNull preserves a null column as null instead of undefined", () => {
    const km = createEntityMapper<{ id?: string; note?: string }>({
      columns: { id: "id", note: { column: "note", keepNull: true } },
    });
    expect(km.toDomain({ id: "x", note: null }).note).toBeNull();
    expect(km.toDomain({ id: "x" }).note).toBeUndefined(); // absent column stays undefined
  });

  it("requiredOnCreate accepts a custom message string", () => {
    const cm = createEntityMapper<{ id?: string; categoryId?: string }>({
      columns: { id: "id", categoryId: { column: "category_id", requiredOnCreate: "category_id is required" } },
    });
    expect(() => cm.toCreateInput({})).toThrowError(/^category_id is required$/);
  });
});

describe("createEntityMapper transforms", () => {
  it("applies toDomain/toColumn value transforms", () => {
    const m = createEntityMapper<{ id?: string; amount?: number }>({
      columns: {
        id: "id",
        amount: { column: "amount_cents", transform: { toDomain: (v) => Number(v) / 100, toColumn: (v) => Math.round((v as number) * 100) } },
      },
    });
    expect(m.toDomain({ id: "1", amount_cents: 500 }).amount).toBe(5);
    expect(m.toCreateInput({ id: "1", amount: 5 }).amount_cents).toBe(500);
    expect(m.toUpdateInput({ amount: 2.5 }).amount_cents).toBe(250);
  });
});
