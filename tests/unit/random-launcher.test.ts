import { describe, expect, it } from "vitest";
import { BUILTIN_PACK_IDS, DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { CustomGamePack, Player, SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { listLauncherTargets, listManualPlayablePacks, mixedCandidatePackIds, pickLauncherTarget, switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { RANDOM_LAUNCHER_PACK_ID } from "@/lib/game-packs/random-launcher";

/**
 * V1.4 R-047/R-051/R-052：「随机玩一个」是动作入口，不是新玩法——
 * 候选只来自注册表里的**真实玩法**（排除启动器自己），自己不出题卡；
 * 游戏包开关只圈 AI 组局候选，不挡首页单玩与随机启动器（R-057）。
 */

const LAUNCHER = RANDOM_LAUNCHER_PACK_ID;
/** 七个真实内置玩法，顺序＝规范顺序（内置 registry 固定顺序）。 */
const REAL_PACK_IDS = [...BUILTIN_PACK_IDS].filter((id) => id !== LAUNCHER);

const players = (count: number, active = count): Player[] =>
  ["a", "b", "c", "d"].slice(0, count).map((id, index) => ({ id, displayName: `玩家${id}`, active: index < active, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(4), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: [...BUILTIN_PACK_IDS], mode: "mixed", ...overrides,
});

const customPack = (id: string, enabled: boolean, minPlayers = 2, updatedAt = "x"): CustomGamePack => ({
  schemaVersion: 1,
  definition: { id, name: `自定义${id}`, icon: "🎲", enabledByDefault: true, mixable: true, minPlayers, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
  cards: [], enabled, updatedAt,
});

describe("random launcher candidates", () => {
  it("只从注册表的真实玩法里挑，启动器自己绝不进候选", () => {
    expect(listLauncherTargets()).toEqual(REAL_PACK_IDS);
    expect(listLauncherTargets()).not.toContain(LAUNCHER);
  });

  it("收纳已启用自定义玩法、忽略未启用自定义；开关只圈混合候选，不缩随机池（R-057）", () => {
    const custom = [customPack("custom-on", true, 2, "2026-01-01T00:00:00.000Z"), customPack("custom-off", false)];
    expect(listLauncherTargets(custom)).toEqual([...REAL_PACK_IDS, "custom-on"]);
    // 「随机玩一个」不吃开关：禁用名单只影响 mixedCandidatePackIds
    expect(mixedCandidatePackIds(custom, ["truth-dare"])).toEqual([...REAL_PACK_IDS.filter((id) => id !== "truth-dare"), "custom-on"]);
    expect(listLauncherTargets(custom)).toContain("truth-dare");
  });

  it("自定义玩法按 updatedAt 再按 id 排在规范序列后面", () => {
    const custom = [
      customPack("custom-b", true, 2, "2026-02-01T00:00:00.000Z"),
      customPack("custom-a", true, 2, "2026-01-01T00:00:00.000Z"),
      customPack("custom-c", true, 2, "2026-02-01T00:00:00.000Z"),
    ];
    expect(listManualPlayablePacks(custom).map((pack) => pack.id)).toEqual([...REAL_PACK_IDS, "custom-a", "custom-b", "custom-c"]);
  });

  it("按当前在场人数过滤 minPlayers", () => {
    const two = listLauncherTargets([], 2);
    expect(two).not.toContain("most-likely");
    expect(two).not.toContain("pointing-game");
    expect(two).toContain("truth-dare");
    expect(two).toContain("spin-bottle");
  });

  it("不按人数过滤时（无 active Session 预选）保留全部真实玩法", () => {
    expect(listLauncherTargets()).toEqual(REAL_PACK_IDS);
  });

  it("固定 RNG 下等概率取首/尾，且不会原地落到当前玩法", () => {
    expect(pickLauncherTarget([], () => 0)).toBe("truth-dare");
    expect(pickLauncherTarget([], () => 0.999999)).toBe("spin-bottle");
    expect(pickLauncherTarget([], () => 0, 4, "truth-dare")).toBe("most-likely");
    // 当前玩法就是启动器时没有可排除的“原地”，正常从真实玩法里挑
    expect(pickLauncherTarget([], () => 0, 4, LAUNCHER)).toBe("truth-dare");
  });

  it("任何输入都不会把启动器自己当作随机结果", () => {
    for (const roll of [0, 0.5, 0.999999]) {
      expect(pickLauncherTarget([], () => roll)).not.toBe(LAUNCHER);
      expect(pickLauncherTarget([customPack("custom-on", true)], () => roll, 4)).not.toBe(LAUNCHER);
    }
  });
});

describe("switchPackAndDeal resolves the launcher (R-052)", () => {
  const singleNeverHave = () => createSession(config({ enabledPackIds: ["never-have"], mode: "single" }), BUILTIN_SEED_CARDS.filter((card) => card.packId === "never-have"));

  it("换成随机挑中的真实玩法，同一 Session、config 与历史都不变", () => {
    const session = singleNeverHave();
    const next = switchPackAndDeal(session, LAUNCHER, [], () => 0);

    expect(next.id).toBe(session.id);
    expect(next.config).toEqual(session.config);
    expect(next.currentPackId).toBe("truth-dare");
    expect(next.currentRound?.packId).toBe("truth-dare");
    expect(next.deckSnapshot.some((card) => card.packId === "truth-dare")).toBe(true);
  });

  it("抽到纯本地玩法时只切玩法、不出题卡，但一样不落到启动器上", () => {
    const next = switchPackAndDeal(singleNeverHave(), LAUNCHER, [], () => 0.999999);

    expect(next.currentPackId).toBe("spin-bottle");
    expect(next.currentRound).toBeUndefined();
  });

  it("host 主动切到一个被关掉 AI 组局的玩法也照常生效（开关只圈组局）", () => {
    const session = singleNeverHave();
    const next = switchPackAndDeal(session, "most-likely", [], () => 0);

    expect(next.currentPackId).toBe("most-likely");
    expect(next.config).toEqual(session.config);
  });
});
