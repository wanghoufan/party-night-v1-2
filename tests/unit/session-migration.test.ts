import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard } from "@/lib/domain/schemas";
import { COMPATIBILITY_PACK_ID, COMPATIBILITY_STATE_KEY, readCompatibilityState } from "@/lib/game-packs/compatibility-test";
import { SPIN_BOTTLE_PACK_ID, SPIN_BOTTLE_STATE_KEY, readSpinBottleState } from "@/lib/game-packs/spin-bottle";
import { getDb } from "@/lib/storage/db";
import { CURRENT_SESSION_SCHEMA_VERSION, migrateSessionRecord } from "@/lib/storage/session-migration";
import { sessionRepository } from "@/lib/storage/session-repository";

const players = ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "2026-09-20T00:00:00.000Z", lastUsedAt: "2026-09-20T00:00:00.000Z" }));

const card = (id: string, packId: string): GameCard => ({
  id, packId, type: "truth", content: id, intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin",
});

const round = (overrides: Record<string, unknown> = {}) => ({
  id: "r1", cardId: "c1", packId: "never-have", participantIds: ["a"], status: "completed",
  startedAt: "2026-09-20T00:30:00.000Z", endedAt: "2026-09-20T00:31:00.000Z", ...overrides,
});

// V1.0 / V1.1 落库形态：schemaVersion=1，且没有 currentPackId / currentPackState / recentRejectedFingerprints
function legacyRecord(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "legacy-1",
    status: "active",
    mode: "mixed",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3,
      boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare", "never-have"], mode: "mixed",
    },
    deckSnapshot: [card("c1", "truth-dare"), card("c2", "never-have")],
    usedCardIds: ["c1"],
    rounds: [round()],
    startedAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T01:00:00.000Z",
    ...overrides,
  };
}

describe("session migration", () => {
  it("bumps the schema version and derives currentPackId from the most recent round", () => {
    const migrated = migrateSessionRecord(legacyRecord());
    expect(migrated?.schemaVersion).toBe(CURRENT_SESSION_SCHEMA_VERSION);
    expect(migrated?.currentPackId).toBe("never-have");
  });

  it("falls back to the first deck card when there is no round history", () => {
    expect(migrateSessionRecord(legacyRecord({ rounds: [] }))?.currentPackId).toBe("truth-dare");
  });

  it("falls back to the first enabled pack when the deck is empty", () => {
    expect(migrateSessionRecord(legacyRecord({ rounds: [], deckSnapshot: [], usedCardIds: [] }))?.currentPackId).toBe("truth-dare");
  });

  it("fills pack state and rejection defaults", () => {
    const migrated = migrateSessionRecord(legacyRecord());
    expect(migrated?.currentPackState).toEqual({});
    expect(migrated?.recentRejectedFingerprints).toEqual([]);
  });

  it("keeps legacy rounds readable", () => {
    const migrated = migrateSessionRecord(legacyRecord());
    expect(migrated?.rounds).toHaveLength(1);
    expect(migrated?.rounds[0]).toMatchObject({ id: "r1", cardId: "c1", packId: "never-have", status: "completed" });
  });

  it("is idempotent", () => {
    const once = migrateSessionRecord(legacyRecord());
    const twice = migrateSessionRecord(once);
    expect(twice).toEqual(once);
  });

  it("rejects unreadable records instead of guessing", () => {
    expect(migrateSessionRecord(undefined)).toBeUndefined();
    expect(migrateSessionRecord(null)).toBeUndefined();
    expect(migrateSessionRecord("nope")).toBeUndefined();
    expect(migrateSessionRecord({ id: "broken" })).toBeUndefined();
    expect(migrateSessionRecord(legacyRecord({ status: "not-a-status" }))).toBeUndefined();
  });

  it("isolates a bad record without dropping a migratable one", async () => {
    const db = await getDb();
    await db.put("sessions", legacyRecord() as never);
    await db.put("sessions", { id: "corrupt", status: "active" } as never);

    const restored = await sessionRepository.getLatestUnfinished();
    expect(restored?.id).toBe("legacy-1");
    expect(restored?.currentPackId).toBe("never-have");
    expect(restored?.schemaVersion).toBe(CURRENT_SESSION_SCHEMA_VERSION);

    expect(await db.get("sessions", "corrupt")).toBeUndefined();
    expect(await db.get("sessions", "legacy-1")).toBeTruthy();

    await sessionRepository.delete("legacy-1");
  });

  it("stays idempotent across repeated reads", async () => {
    const db = await getDb();
    await db.put("sessions", legacyRecord() as never);
    const first = await sessionRepository.get("legacy-1");
    const second = await sessionRepository.get("legacy-1");
    expect(second).toEqual(first);
    await sessionRepository.delete("legacy-1");
  });
});

/** GAP-02：V2 早期把 pack-local state 按 state key 平铺；新口径按 packId 分键，读取时在内存里补齐。 */describe("pack state backfill (GAP-02)", () => {
  const currentRecord = (currentPackState: Record<string, unknown>) =>
    legacyRecord({ schemaVersion: CURRENT_SESSION_SCHEMA_VERSION, currentPackId: COMPATIBILITY_PACK_ID, currentPackState, recentRejectedFingerprints: [] });

  it("moves a flat compatibility state under its pack id", () => {
    const compatibility = { playerAId: "a", playerBId: "b", score: 2, rounds: 3 };
    const migrated = migrateSessionRecord(currentRecord({ [COMPATIBILITY_STATE_KEY]: compatibility }));

    expect(migrated?.currentPackState).toEqual({ [COMPATIBILITY_PACK_ID]: compatibility });
    expect(migrated ? readCompatibilityState(migrated) : undefined).toEqual(compatibility);
  });

  it("keeps the spin-bottle state readable and defaults a missing map", () => {
    const spin = { lastSelectedPlayerId: "b" };
    const migrated = migrateSessionRecord(currentRecord({ [SPIN_BOTTLE_STATE_KEY]: spin }));

    expect(migrated?.currentPackState).toEqual({ [SPIN_BOTTLE_PACK_ID]: spin });
    expect(migrated ? readSpinBottleState(migrated) : undefined).toEqual(spin);
    expect(migrateSessionRecord(legacyRecord({ schemaVersion: CURRENT_SESSION_SCHEMA_VERSION, currentPackId: "never-have" }))?.currentPackState).toEqual({});
  });

  it("keeps both packs' states of an already-nested record untouched", () => {
    const nested = { [COMPATIBILITY_PACK_ID]: { playerAId: "a", playerBId: "b", score: 1, rounds: 1 }, [SPIN_BOTTLE_PACK_ID]: { lastSelectedPlayerId: "c" } };
    const migrated = migrateSessionRecord(currentRecord(nested));

    expect(migrated?.currentPackState).toEqual(nested);
    expect(migrateSessionRecord(migrated)?.currentPackState).toEqual(nested);
  });
});

/**
 * V1.4 R-048 / R-049：`ai-improv` 玩法退役，id 只留作迁移锚。
 * 迁移只做「丢弃 + 回落」：旧卡绝不转写进真心话，历史轮次原样保留。
 */
describe("retired ai-improv migration（V1.4）", () => {
  const TRUTH = card("t9", "truth-dare");
  const RETIRED = card("i1", "ai-improv");
  const NEVER = card("n1", "never-have");

  const currentRecordWithRetiredData = (overrides: Record<string, unknown> = {}) =>
    legacyRecord({
      schemaVersion: CURRENT_SESSION_SCHEMA_VERSION,
      currentPackId: "ai-improv",
      deckSnapshot: [TRUTH, RETIRED, NEVER],
      usedCardIds: ["t9", "i1"],
      rounds: [],
      currentRound: { id: "r9", cardId: "i1", packId: "ai-improv", participantIds: ["a"], startedAt: "2026-09-20T01:00:00.000Z" },
      recentRejectedFingerprints: [],
      currentPackState: {},
      ...overrides,
    });

  it("直接丢弃 ai-improv 旧卡，不转写、不并入真心话（负断言：真心话题库未被污染）", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData())!;

    expect(migrated.deckSnapshot.map((item) => item.id)).toEqual(["t9", "n1"]);
    expect(migrated.deckSnapshot.some((item) => item.packId === "ai-improv")).toBe(false);
    // 真心话卡片数量与内容逐字不变：退役卡的内容没有以任何形式跑进来
    expect(migrated.deckSnapshot.filter((item) => item.packId === "truth-dare")).toEqual([TRUTH]);
    expect(migrated.deckSnapshot.some((item) => item.content === RETIRED.content)).toBe(false);
    expect(migrated.deckSnapshot.some((item) => item.id === RETIRED.id)).toBe(false);
  });

  it("清掉指向旧卡的使用记录与未完成轮", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData())!;

    expect(migrated.usedCardIds).toEqual(["t9"]);
    expect(migrated.currentRound).toBeUndefined();
  });

  it("currentPackId 命中退役 id 时回落真心话（已启用且可玩）", () => {
    expect(migrateSessionRecord(currentRecordWithRetiredData())?.currentPackId).toBe("truth-dare");
  });

  it("真心话被禁用时回落规范启用序列里第一个可玩玩法", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData({
      config: { ...legacyRecord().config, enabledPackIds: ["never-have", "ai-improv"] },
    }));

    expect(migrated?.currentPackId).toBe("never-have");
  });

  it("旧版本记录里最近一轮是退役玩法时同样回落，不把退役 id 当当前玩法", () => {
    const migrated = migrateSessionRecord(legacyRecord({
      deckSnapshot: [TRUTH, RETIRED],
      usedCardIds: ["t9"],
      rounds: [round({ packId: "ai-improv", cardId: "i1" })],
    }));

    expect(migrated?.currentPackId).toBe("truth-dare");
    expect(migrated?.deckSnapshot.map((item) => item.id)).toEqual(["t9"]);
  });

  it("已完成历史保留原 packId，不改名、不重入出题池", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData({
      rounds: [round({ packId: "ai-improv", cardId: "i1", status: "completed" })],
    }))!;

    expect(migrated.rounds[0]).toMatchObject({ packId: "ai-improv", cardId: "i1", status: "completed" });
    expect(migrated.deckSnapshot.some((item) => item.id === "i1")).toBe(false);
  });

  it("极端旧局只启用了退役玩法时没有任何合法候选，不激活该局（安全回首页）", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData({
      config: { ...legacyRecord().config, enabledPackIds: ["ai-improv"] },
    }));

    expect(migrated).toBeUndefined();
  });

  it("快照里的包都已退役/不存在时同样不猜、不激活", () => {
    const migrated = migrateSessionRecord(currentRecordWithRetiredData({
      config: { ...legacyRecord().config, enabledPackIds: ["ai-improv", "deleted-custom"] },
    }));

    expect(migrated).toBeUndefined();
  });

  it("幂等：重复迁移同一份 fixture 结果完全相同，不再删改非退役数据", () => {
    const once = migrateSessionRecord(currentRecordWithRetiredData())!;
    expect(migrateSessionRecord(once)).toEqual(once);
    expect(migrateSessionRecord(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("读取路径也按同一规则清理（不留下白屏的退役 currentPackId）", async () => {
    const db = await getDb();
    await db.put("sessions", currentRecordWithRetiredData() as never);

    const restored = await sessionRepository.get("legacy-1");
    expect(restored?.currentPackId).toBe("truth-dare");
    expect(restored?.deckSnapshot.some((item) => item.packId === "ai-improv")).toBe(false);
    // 原记录仍留在库里（非破坏），只是读出来已清理
    expect(await db.get("sessions", "legacy-1")).toBeTruthy();

    await sessionRepository.delete("legacy-1");
  });
});
