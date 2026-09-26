import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { Player, SessionConfig } from "@/lib/domain/schemas";
import { deriveQuickStartConfig } from "@/lib/engine/quick-start";
import {
  hasSwitchableAlternative,
  listSwitchablePacks,
  mixedCandidatePackIds,
  noPlayablePackNotice,
  noSwitchablePackNotice,
  packMinPlayersNotice,
  packSwitchBlockedNotice,
  switchPackAndDeal,
} from "@/lib/engine/pack-switcher";
import { createSession } from "@/lib/engine/session-engine";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

/**
 * R-CB4（用户 V1.2 §四）六条最低测试：两人非法玩法 + mixed 空候选不得复活。
 *
 * 死局原型：候选为空时旧代码回落到「全部内置玩法」，于是
 * ① 复活用户已关闭的玩法、② 复活人数非法的玩法（2 人局塞进 minPlayers=3 的玩法）
 * → AI 组局生成 0 张卡 → 主局「可玩的题都出完了」只能洗牌空转。
 * 现在的口径：候选 > 0 正常继续；候选 = 0 停下并提示，绝不回落。
 */

const players = (total: number, active = total): Player[] =>
  ["a", "b", "c", "d"].slice(0, total).map((id, index) => ({ id, displayName: `玩家${id}`, active: index < active, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(4), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["never-have"], mode: "mixed", ...overrides,
});

/** 2 人局里所有 minPlayers<=2 的玩法（关掉它们就会把 mixed 池掏空）。 */
const TWO_PLAYER_PACK_IDS = ["truth-dare", "never-have", "would-you-rather", "compatibility-test", "spin-bottle"];

describe("R-CB4 六条最低测试", () => {
  it("1｜2 人直选 most-likely（minPlayers=3）：拦截文案在，混合候选不含它，主局切包也不放行", () => {
    expect(packMinPlayersNotice("most-likely", 2)).toMatch(/「谁最可能」至少需要 3 人/);
    expect(mixedCandidatePackIds([], [], 2)).not.toContain("most-likely");

    const session = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    expect(switchPackAndDeal(session, "most-likely", [], () => 0)).toBe(session);
    expect(packSwitchBlockedNotice(session, "most-likely")).toMatch(/至少需要 3 人/);
  });

  it("2｜2 人直选 pointing-game（minPlayers=3）：同样被拦住，不给任何放行路径", () => {
    expect(packMinPlayersNotice("pointing-game", 2)).toMatch(/「指人游戏」至少需要 3 人/);
    expect(mixedCandidatePackIds([], [], 2)).not.toContain("pointing-game");

    const session = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session).map((pack) => pack.id)).not.toContain("pointing-game");
    expect(switchPackAndDeal(session, "pointing-game", [], () => 0)).toBe(session);
  });

  it("3｜3 人时两种玩法都恢复：门槛只跟在场人数走，不是永久禁用", () => {
    expect(packMinPlayersNotice("most-likely", 3)).toBeUndefined();
    expect(packMinPlayersNotice("pointing-game", 3)).toBeUndefined();

    const ids = mixedCandidatePackIds([], [], 3);
    expect(ids).toContain("most-likely");
    expect(ids).toContain("pointing-game");

    const session = createSession(config({ players: players(3), mode: "single" }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session).map((pack) => pack.id)).toContain("pointing-game");
    expect(switchPackAndDeal(session, "pointing-game", [], () => 0)).toMatchObject({ currentPackId: "pointing-game" });
  });

  it("4｜2 人 + 关掉所有 minPlayers<=2 玩法：池子归零、有提示，且绝不复活任何已关闭/人数非法玩法", () => {
    // 候选归零——旧代码会在这里回落到全部内置（8 个），把关掉的 5 个和 3 人玩法一起复活。
    expect(mixedCandidatePackIds([], TWO_PLAYER_PACK_IDS, 2)).toEqual([]);

    const notice = noPlayablePackNotice(2);
    expect(notice).toMatch(/没有可玩的玩法/);
    expect(notice).toMatch(/当前在场 2 人/);
    expect(notice).toMatch(/游戏包/);

    // 一点人就恢复：3 人时只剩 3 人玩法可选，被关掉的 2 人玩法一个都不回来。
    expect(mixedCandidatePackIds([], TWO_PLAYER_PACK_IDS, 3)).toEqual(["most-likely", "pointing-game"]);
    // 关掉 3 人玩法则池子重新归零：不是「至少留一个」被破例，而是这一份设置确实没有可选玩法。
    expect(mixedCandidatePackIds([], [...TWO_PLAYER_PACK_IDS, "most-likely", "pointing-game"], 3)).toEqual([]);
  });

  it("5｜active 玩家异常降到不足任何玩法门槛：面板无候选、切包原样返回、当场有提示，不静默复活", () => {
    // 异常局面：4 人局只剩 1 人在场（正常 UI 拦在 >=2，这里防的是坏数据/迁移遗留）。
    const session = createSession(config({ players: players(4, 1), enabledPackIds: ["truth-dare"] }), BUILTIN_SEED_CARDS);

    expect(hasSwitchableAlternative(session)).toBe(false);
    expect(listSwitchablePacks(session).map((pack) => pack.id)).toEqual([session.currentPackId]);
    expect(noSwitchablePackNotice(session)).toBe(noPlayablePackNotice(1));

    // 切任何玩法都不成立，且返回的是原对象（没有偷偷换成别的玩法）。
    for (const packId of ["spin-bottle", "never-have", "most-likely"]) {
      expect(switchPackAndDeal(session, packId, [], () => 0)).toBe(session);
      expect(packSwitchBlockedNotice(session, packId)).toMatch(/没有可玩的玩法|至少需要/);
    }
    // 人回齐了（2 人）提示立刻消失，照常能换。
    const restored = { ...session, config: { ...session.config, players: players(4, 2) } };
    expect(noSwitchablePackNotice(restored)).toBeUndefined();
    expect(hasSwitchableAlternative(restored)).toBe(true);
  });

  it("6｜三处入口同一口径：setup 混合池 / 主局切包 / 快速开局在 2 人时一致排除 3 人玩法，3 人时一致恢复", () => {
    // ① setup 的 AI 组局混合池
    expect(mixedCandidatePackIds([], [], 2)).not.toContain("pointing-game");
    expect(mixedCandidatePackIds([], [], 2)).not.toContain("most-likely");

    // ② 主局切包的候选与切换编排
    const twoPlayerSession = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    const twoIds = listSwitchablePacks(twoPlayerSession).map((pack) => pack.id);
    expect(twoIds).not.toContain("pointing-game");
    expect(twoIds).not.toContain("most-likely");
    expect(switchPackAndDeal(twoPlayerSession, "pointing-game", [], () => 0)).toBe(twoPlayerSession);

    // ③ 快速开局按「上次名单」的在场人数复核对同一句门槛
    const lastRoster = config({ players: players(2) });
    const lastActive = lastRoster.players.filter((player) => player.active).length;
    expect(packMinPlayersNotice("pointing-game", lastActive)).toMatch(/至少需要 3 人/);
    expect(packMinPlayersNotice("most-likely", lastActive)).toMatch(/至少需要 3 人/);

    // 3 人：三处一起恢复
    expect(mixedCandidatePackIds([], [], 3)).toContain("pointing-game");
    const threePlayerSession = createSession(config({ players: players(3) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(threePlayerSession).map((pack) => pack.id)).toContain("most-likely");
    const threeRoster = config({ players: players(3) });
    expect(packMinPlayersNotice("pointing-game", threeRoster.players.filter((player) => player.active).length)).toBeUndefined();
    expect(deriveQuickStartConfig(threeRoster, "pointing-game")).toMatchObject({ mode: "single", enabledPackIds: ["pointing-game"] });
  });
});
