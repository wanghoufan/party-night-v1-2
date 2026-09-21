import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/storage/db";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { loadDisabledPackIds, loadEnabledPackIds, setPackEnabled } from "@/lib/storage/pack-enablement";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

/**
 * 玩法启用集合（T199 / FR-044）：内置默认启用、只在 preferences 里记禁用名单；自定义玩法沿用 enabled。
 * 复用既有 preferences，不新增第二套存储。
 */

const builtinIds = BUILTIN_GAME_PACKS.map((pack) => pack.id);

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
  it("默认全部内置玩法启用", async () => {
    expect(await loadEnabledPackIds()).toEqual(builtinIds);
    expect(await loadDisabledPackIds()).toEqual([]);
  });

  it("禁用内置玩法后它从启用集合里消失，重新启用后回来", async () => {
    await setPackEnabled("ai-improv", false);
    expect(await loadDisabledPackIds()).toEqual(["ai-improv"]);
    expect(await loadEnabledPackIds()).not.toContain("ai-improv");
    expect(await loadEnabledPackIds()).toContain("truth-dare");

    await setPackEnabled("ai-improv", true);
    expect(await loadDisabledPackIds()).toEqual([]);
    expect(await loadEnabledPackIds()).toEqual(builtinIds);
  });

  it("切换禁用状态不会清掉偏好里的其他字段", async () => {
    const db = await getDb();
    await db.put("preferences", { id: "main", recentPlayers: [{ id: "p1", displayName: "Alex", active: true, createdAt: "x", lastUsedAt: "x" }], activeProviderId: "p1", updatedAt: "x" });

    await setPackEnabled("spin-bottle", false);

    const preference = await db.get("preferences", "main");
    expect(preference?.recentPlayers).toHaveLength(1);
    expect(preference?.activeProviderId).toBe("p1");
    expect(preference?.disabledPackIds).toEqual(["spin-bottle"]);
  });

  it("自定义玩法继续按自身 enabled 决定是否在集合里", async () => {
    await gamePackRepository.save(customPack("custom-on", true));
    await gamePackRepository.save(customPack("custom-off", false));

    const enabled = await loadEnabledPackIds();

    expect(enabled).toContain("custom-on");
    expect(enabled).not.toContain("custom-off");
  });

  it("重复禁用同一玩法不会写重复项", async () => {
    await setPackEnabled("never-have", false);
    await setPackEnabled("never-have", false);
    expect(await loadDisabledPackIds()).toEqual(["never-have"]);
  });
});
