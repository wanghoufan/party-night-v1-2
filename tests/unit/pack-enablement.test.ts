import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/storage/db";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { LAST_PACK_MESSAGE, loadDisabledPackIds, loadMixedCandidatePackIds, setPackPlayability } from "@/lib/storage/pack-enablement";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

/**
 * 玩法开关（V1.4 R-054/R-055/R-056）：内置默认开、只在 preferences 记关闭名单；自定义沿用 enabled。
 * 开关的语义是“关闭则不加入 AI 组局”，所以集合口径＝混合候选；关掉最后一个候选必须整笔拒绝。
 */

/** 混合候选＝全部内置真实玩法（启动器不出题卡，不算候选）。 */
const realBuiltinIds = BUILTIN_GAME_PACKS.map((pack) => pack.id).filter((id) => id !== "ai-improv");

const customPack = (id: string, enabled: boolean): CustomGamePack => ({
  schemaVersion: 1,
  definition: { id, name: `自定义${id}`, icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
  cards: [], enabled, updatedAt: "x",
});

afterEach(async () => {
  const db = await getDb();
  await Promise.all([db.clear("preferences"), db.clear("gamePacks")]);
});

describe("pack enablement", () => {
  it("默认全部内置真实玩法都是混合候选，没有关闭名单", async () => {
    expect(await loadMixedCandidatePackIds()).toEqual(realBuiltinIds);
    expect(await loadDisabledPackIds()).toEqual([]);
  });

  it("关闭内置玩法后它退出混合候选，重新打开后回来", async () => {
    await setPackPlayability("never-have", false);
    expect(await loadDisabledPackIds()).toEqual(["never-have"]);
    expect(await loadMixedCandidatePackIds()).not.toContain("never-have");
    expect(await loadMixedCandidatePackIds()).toContain("truth-dare");

    await setPackPlayability("never-have", true);
    expect(await loadDisabledPackIds()).toEqual([]);
    expect(await loadMixedCandidatePackIds()).toEqual(realBuiltinIds);
  });

  it("切换关闭状态不会清掉偏好里的其他字段", async () => {
    const db = await getDb();
    await db.put("preferences", { id: "main", recentPlayers: [{ id: "p1", displayName: "Alex", active: true, createdAt: "x", lastUsedAt: "x" }], activeProviderId: "p1", updatedAt: "x" });

    await setPackPlayability("spin-bottle", false);

    const preference = await db.get("preferences", "main");
    expect(preference?.recentPlayers).toHaveLength(1);
    expect(preference?.activeProviderId).toBe("p1");
    expect(preference?.disabledPackIds).toEqual(["spin-bottle"]);
  });

  it("自定义玩法按自身 enabled 参与混合候选", async () => {
    await gamePackRepository.save(customPack("custom-on", true));
    await gamePackRepository.save(customPack("custom-off", false));

    const mixed = await loadMixedCandidatePackIds();

    expect(mixed).toContain("custom-on");
    expect(mixed).not.toContain("custom-off");
  });

  it("重复关闭同一玩法不会写重复项", async () => {
    await setPackPlayability("never-have", false);
    await setPackPlayability("never-have", false);
    expect(await loadDisabledPackIds()).toEqual(["never-have"]);
  });
});

describe("强制留一（R-054 / R-055）", () => {
  it("关掉最后一个内置候选被拒绝：返回结构化原因、开关保持、库里不写关闭名单", async () => {
    for (const id of realBuiltinIds.slice(0, -1)) await setPackPlayability(id, false);
    expect(await loadMixedCandidatePackIds()).toEqual([realBuiltinIds.at(-1)]);

    const rejected = await setPackPlayability(realBuiltinIds.at(-1)!, false);

    expect(rejected).toEqual({ ok: false, reason: "last-pack", disabledPackIds: realBuiltinIds.slice(0, -1) });
    expect(await loadDisabledPackIds()).toEqual(realBuiltinIds.slice(0, -1));
    expect(await loadMixedCandidatePackIds()).toEqual([realBuiltinIds.at(-1)]);
    expect(LAST_PACK_MESSAGE).toContain("至少保留一个玩法");
  });

  it("关掉最后一个自定义候选同样被拒绝，enabled 保持 true", async () => {
    await gamePackRepository.save(customPack("custom-only", true));
    for (const id of realBuiltinIds) expect((await setPackPlayability(id, false)).ok).toBe(true);

    const rejected = await setPackPlayability("custom-only", false);

    expect(rejected.ok).toBe(false);
    expect((await gamePackRepository.get("custom-only"))?.enabled).toBe(true);
    expect(await loadMixedCandidatePackIds()).toEqual(["custom-only"]);
  });

  it("快速连点/并发关闭不会短暂落成零候选", async () => {
    const last = realBuiltinIds.at(-1)!;
    for (const id of realBuiltinIds.slice(0, -1)) await setPackPlayability(id, false);

    const results = await Promise.all([setPackPlayability(last, false), setPackPlayability(last, false), setPackPlayability(last, false)]);

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(await loadMixedCandidatePackIds()).toEqual([last]);
  });

  it("内置与自定义合并计数：还有一个自定义开着就能继续关内置", async () => {
    await gamePackRepository.save(customPack("custom-last", true));
    for (const id of realBuiltinIds) {
      const result = await setPackPlayability(id, false);
      expect(result.ok).toBe(true);
    }

    expect(await loadMixedCandidatePackIds()).toEqual(["custom-last"]);
    expect((await setPackPlayability("custom-last", false)).ok).toBe(false);
  });
});
