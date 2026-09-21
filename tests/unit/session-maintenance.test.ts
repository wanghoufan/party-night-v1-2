import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard } from "@/lib/domain/schemas";
import { getDb } from "@/lib/storage/db";
import { classifySchemaVersion, reconcileSessionStore } from "@/lib/storage/session-maintenance";
import { CURRENT_SESSION_SCHEMA_VERSION } from "@/lib/storage/session-migration";

/**
 * 事务化 migration + 版本错位 guard（T201 / FR-043 / SC-013）：
 * 迁移在单个 IndexedDB 事务边界内完成、幂等、非破坏；坏记录进隔离区；新版本写的数据只读不动、绝不清库。
 */

const players = ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "2026-09-20T00:00:00.000Z", lastUsedAt: "2026-09-20T00:00:00.000Z" }));

const card = (id: string, packId: string): GameCard => ({
  id, packId, type: "truth", content: id, intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin",
});

/** V1.x 落库形态：schemaVersion=1，缺 currentPackId / currentPackState / recentRejectedFingerprints。 */
function legacyRecord(id: string) {
  return {
    schemaVersion: 1, id, status: "active", mode: "mixed",
    config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare", "never-have"], mode: "mixed" },
    deckSnapshot: [card("c1", "truth-dare")], usedCardIds: [],
    rounds: [{ id: "r1", cardId: "c1", packId: "never-have", participantIds: ["a"], status: "completed", startedAt: "2026-09-20T00:30:00.000Z", endedAt: "2026-09-20T00:31:00.000Z" }],
    startedAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T01:00:00.000Z",
  };
}

const db = async () => getDb();

afterEach(async () => {
  const store = await db();
  await Promise.all([store.clear("sessions"), store.clear("sessionQuarantine")]);
});

describe("classifySchemaVersion（版本错位分类）", () => {
  it("区分当前 / 可迁移 / 更新版本 / 非法版本", () => {
    expect(classifySchemaVersion(CURRENT_SESSION_SCHEMA_VERSION)).toBe("current");
    expect(classifySchemaVersion(CURRENT_SESSION_SCHEMA_VERSION - 1)).toBe("migratable");
    expect(classifySchemaVersion(CURRENT_SESSION_SCHEMA_VERSION + 7)).toBe("newer");
    expect(classifySchemaVersion("2")).toBe("unknown");
    expect(classifySchemaVersion(undefined)).toBe("unknown");
  });
});

describe("reconcileSessionStore（单事务迁移 + 隔离，幂等不清库）", () => {
  it("把旧记录原地升级到当前 schema，并补出推导来的 currentPackId", async () => {
    await (await db()).put("sessions", legacyRecord("legacy-1") as never);

    const result = await reconcileSessionStore();

    expect(result).toMatchObject({ ok: true, migrated: 1, quarantined: 0, newerSchema: 0 });
    const stored = await (await db()).get("sessions", "legacy-1") as { schemaVersion: number; currentPackId: string; currentPackState: unknown; recentRejectedFingerprints: unknown };
    expect(stored.schemaVersion).toBe(CURRENT_SESSION_SCHEMA_VERSION);
    expect(stored.currentPackId).toBe("never-have");
    expect(stored.currentPackState).toEqual({});
    expect(stored.recentRejectedFingerprints).toEqual([]);
  });

  it("幂等：第二次运行不再写库，也不丢任何记录", async () => {
    await (await db()).put("sessions", legacyRecord("legacy-1") as never);
    await reconcileSessionStore();

    const second = await reconcileSessionStore();

    expect(second.migrated).toBe(0);
    expect(second.quarantined).toBe(0);
    expect(await (await db()).get("sessions", "legacy-1")).toBeTruthy();
  });

  it("坏记录进隔离区保留原始副本，有效旧记录照常升级（不清库）", async () => {
    const broken = { id: "broken-1", status: "active", rounds: [{ packId: 5 }] };
    await (await db()).put("sessions", legacyRecord("legacy-1") as never);
    await (await db()).put("sessions", broken as never);

    const result = await reconcileSessionStore();

    expect(result.migrated).toBe(1);
    expect(result.quarantined).toBe(1);
    expect(await (await db()).get("sessions", "broken-1")).toBeUndefined();
    expect((await (await db()).get("sessionQuarantine", "broken-1"))?.raw).toEqual(broken);
    expect((await (await db()).get("sessions", "legacy-1")) as { schemaVersion: number }).toMatchObject({ schemaVersion: CURRENT_SESSION_SCHEMA_VERSION });
  });

  it("新版本写的数据只读不动：不迁移、不隔离、不清除", async () => {
    const future = { ...legacyRecord("future-1"), schemaVersion: CURRENT_SESSION_SCHEMA_VERSION + 5, currentPackId: "future-pack" };
    await (await db()).put("sessions", future as never);

    const result = await reconcileSessionStore();

    expect(result).toMatchObject({ newerSchema: 1, migrated: 0, quarantined: 0 });
    expect(await (await db()).get("sessions", "future-1")).toEqual(future);
    expect(await (await db()).get("sessionQuarantine", "future-1")).toBeUndefined();
  });

  it("空库也不炸：没有 Session 时安静返回", async () => {
    await expect(reconcileSessionStore()).resolves.toMatchObject({ ok: true, migrated: 0, quarantined: 0 });
  });
});
