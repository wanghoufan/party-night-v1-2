import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard } from "@/lib/domain/schemas";
import { getDb } from "@/lib/storage/db";
import { CURRENT_SESSION_SCHEMA_VERSION, migrateSessionRecord } from "@/lib/storage/session-migration";
import { sessionRepository } from "@/lib/storage/session-repository";

const players = ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "2026-09-20T00:00:00.000Z", lastUsedAt: "2026-09-20T00:00:00.000Z" }));

const card = (id: string, packId: string): GameCard => ({
  id, packId, type: "truth", content: id, intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin",
});

/** 可迁移的旧记录：V1.x 落库形态（缺 currentPackId / currentPackState）。 */
function migratableRecord(id: string) {
  return {
    schemaVersion: 1, id, status: "active", mode: "mixed",
    config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare", "never-have"], mode: "mixed" },
    deckSnapshot: [card("c1", "truth-dare")], usedCardIds: [],
    rounds: [{ id: "r1", cardId: "c1", packId: "never-have", participantIds: ["a"], status: "completed", startedAt: "2026-09-20T00:30:00.000Z", endedAt: "2026-09-20T00:31:00.000Z" }],
    startedAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T01:00:00.000Z",
  };
}

const quarantined = async (id: string) => (await getDb()).get("sessionQuarantine", id);

// fake-indexeddb 在同一文件内跨用例复用：每条用例自带清场，用例之间不互相污染。
afterEach(async () => {
  const db = await getDb();
  await Promise.all([db.clear("sessions"), db.clear("sessionQuarantine")]);
});

describe("bad session isolation", () => {
  it("moves an unreadable record into quarantine instead of dropping the data", async () => {
    const broken = { id: "broken-1", status: "active", rounds: [{ packId: 5 }] };
    await (await getDb()).put("sessions", broken as never);

    await expect(sessionRepository.get("broken-1")).resolves.toBeUndefined();

    // 不再留在 sessions（否则每次启动都会重复失败），原始内容仍可在隔离区查回
    expect(await (await getDb()).get("sessions", "broken-1")).toBeUndefined();
    const record = await quarantined("broken-1");
    expect(record).toMatchObject({ id: "broken-1", reason: "deserialize-failed" });
    expect(record?.raw).toEqual(broken);
    expect(typeof record?.quarantinedAt).toBe("string");
  });

  it("leaves a migratable old record readable and unquarantined", async () => {
    await (await getDb()).put("sessions", migratableRecord("legacy-ok") as never);

    const restored = await sessionRepository.get("legacy-ok");

    expect(restored?.currentPackId).toBe("never-have");
    expect(restored?.schemaVersion).toBe(CURRENT_SESSION_SCHEMA_VERSION);
    expect(await quarantined("legacy-ok")).toBeUndefined();
    await sessionRepository.delete("legacy-ok");
  });

  it("still returns the valid session when a bad record sits next to it", async () => {
    await (await getDb()).put("sessions", migratableRecord("legacy-2") as never);
    await (await getDb()).put("sessions", { id: "broken-2", status: "active" } as never);

    const latest = await sessionRepository.getLatestUnfinished();

    expect(latest?.id).toBe("legacy-2");
    expect(await (await getDb()).get("sessions", "broken-2")).toBeUndefined();
    expect((await quarantined("broken-2"))?.reason).toBe("deserialize-failed");
    await sessionRepository.delete("legacy-2");
  });

  it("quarantines records that have no usable id without breaking the read path", async () => {
    // 落库键合法但不是字符串 id（旧数据/外部写入都可能这样）：隔离后仍能被查回原始内容
    await (await getDb()).put("sessions", { id: 123, status: "active" } as never);

    const latest = await sessionRepository.getLatestUnfinished();

    expect(latest).toBeUndefined();
    expect(await (await getDb()).get("sessions", 123 as unknown as string)).toBeUndefined();
    expect((await quarantined("123"))?.reason).toBe("deserialize-failed");
    expect((await quarantined("123"))?.raw).toEqual({ id: 123, status: "active" });
  });

  it("never throws out of the repository — a bad record must not white-screen the home page", async () => {
    for (const junk of [undefined, null, 42, "nope", [], { id: "broken-3", config: "not-an-object" }]) {
      expect(migrateSessionRecord(junk)).toBeUndefined();
    }

    await (await getDb()).put("sessions", { id: "broken-3", config: "not-an-object" } as never);
    await expect(sessionRepository.get("broken-3")).resolves.toBeUndefined();
    await expect(sessionRepository.getLatestUnfinished()).resolves.toBeUndefined();
    expect((await quarantined("broken-3"))?.reason).toBe("deserialize-failed");
  });
});
