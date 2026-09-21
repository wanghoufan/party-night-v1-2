import { describe, expect, it } from "vitest";
import { BUILTIN_PACK_IDS, DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { CustomGamePack, Player, SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { enabledPackIds, listLauncherTargets, pickLauncherTarget, switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { RANDOM_LAUNCHER_PACK_ID } from "@/lib/game-packs/random-launcher";

/**
 * V1.4 R-047/R-051/R-052：「随机玩一个」是动作入口，不是新玩法——
 * 候选只来自统一启用集合里的**真实玩法**（排除启动器自己），自己不出题卡。
 */

const LAUNCHER = RANDOM_LAUNCHER_PACK_ID;
/** 七个真实内置玩法，顺序＝统一启用集合顺序（registry 固定顺序）。 */
const REAL_PACK_IDS = [...BUILTIN_PACK_IDS].filter((id) => id !== LAUNCHER);

const players = (count: number, active = count): Player[] =>
  ["a", "b", "c", "d"].slice(0, count).map((id, index) => ({ id, displayName: `玩家${id}`, active: index < active, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(4), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: [...BUILTIN_PACK_IDS], mode: "mixed", ...overrides,
});

const customPack = (id: string, enabled: boolean, minPlayers = 2): CustomGamePack => ({
  schemaVersion: 1,
  definition: { id, name: `自定义${id}`, icon: "🎲", enabledByDefault: true, mixable: true, minPlayers, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
  cards: [], enabled, updatedAt: "x",
});

describe("random launcher candidates", () => {
  it("只从已启用的真实玩法里挑，启动器自己绝不进候选", () => {
    expect(listLauncherTargets(enabledPackIds())).toEqual(REAL_PACK_IDS);
    expect(listLauncherTargets(enabledPackIds())).not.toContain(LAUNCHER);
  });

  it("尊重启用/禁用名单与自定义玩法", () => {
    const custom = [customPack("custom-on", true), customPack("custom-off", false)];
    expect(listLauncherTargets(enabledPackIds(custom, ["truth-dare"]), custom)).toEqual([...REAL_PACK_IDS.filter((id) => id !== "truth-dare"), "custom-on"]);
  });

  it("按当前在场人数过滤 minPlayers", () => {
    const two = listLauncherTargets(enabledPackIds(), [], 2);
    expect(two).not.toContain("most-likely");
    expect(two).not.toContain("pointing-game");
    expect(two).toContain("truth-dare");
    expect(two).toContain("spin-bottle");
  });

  it("不按人数过滤时（无 active Session 预选）保留全部真实玩法", () => {
    expect(listLauncherTargets(enabledPackIds(), [])).toEqual(REAL_PACK_IDS);
  });

  it("固定 RNG 下等概率取首/尾，且不会原地落到当前玩法", () => {
    expect(pickLauncherTarget(enabledPackIds(), [], () => 0)).toBe("truth-dare");
    expect(pickLauncherTarget(enabledPackIds(), [], () => 0.999999)).toBe("spin-bottle");
    expect(pickLauncherTarget(enabledPackIds(), [], () => 0, 4, "truth-dare")).toBe("most-likely");
    // 候选只剩当前玩法时不再排除，避免“随机”变成无条件失败
    expect(pickLauncherTarget(["truth-dare", LAUNCHER], [], () => 0, 4, "truth-dare")).toBe("truth-dare");
  });

  it("没有任何可玩的真实玩法时返回 undefined（调用方停原页提示，不静默开局）", () => {
    expect(pickLauncherTarget([LAUNCHER], [], () => 0)).toBeUndefined();
    expect(pickLauncherTarget(["not-registered"], [], () => 0)).toBeUndefined();
    expect(listLauncherTargets([LAUNCHER, "not-registered"])).toEqual([]);
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

  it("禁用名单把候选压空时原样返回，调用方按引用判断未切换", () => {
    const session = singleNeverHave();
    expect(switchPackAndDeal(session, LAUNCHER, [], () => 0, {}, REAL_PACK_IDS)).toBe(session);
  });
});
