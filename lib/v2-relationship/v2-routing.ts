import {
  createEmptyPlayerCoverage,
  eligiblePair,
  pairKey,
  type PairGender,
  type PlayerCoverage,
  type SessionParticipant,
} from "./v2-state";

export interface ScoredPair {
  pairKey: string;
  score: number;
}

/* ------------------------------------------------------------------ */
/* Coverage 软排序（R-CB5 / R-CB8），只降权不越硬合法                       */
/* ------------------------------------------------------------------ */

/**
 * 单玩家「已获定向机会」分档上限：offered 达到此值即视为同等「已覆盖」，
 * 避免无上限的 offered 计数把软权重放大到足以压过 Signal。
 */
export const COVERAGE_OFFERED_TIER_CAP = 2 as const;

/**
 * Coverage 软扣分上限。必须严格小于最小的非零 Signal 分值步长（0.5，见 scorePair
 * 的 0.5 系数），本轮取 0.4 < 0.5：任意两张片的 Signal 差 ≥0.5 时，Coverage 最多
 * 只能把差距压缩到 ≥0.1，绝不翻转既有 Signal 语义。
 */
export const COVERAGE_MAX_PENALTY = 0.4 as const;

/**
 * 单玩家覆盖度：offered（封顶）+ 连续定向跳过 + 低参与，数值越大代表
 * 「已被系统给过机会、应当让位」。skip 也算已获机会（R-CB8：不因 completed=0 永久优先）。
 */
export function coverageExposure(coverage: PlayerCoverage): number {
  return (
    Math.min(coverage.offeredTargeted, COVERAGE_OFFERED_TIER_CAP) +
    (coverage.consecutiveTargetedSkips > 0 ? 1 : 0) +
    (coverage.lowParticipation ? 1 : 0)
  );
}

/** 单玩家覆盖度理论上界：封顶 offered + 连续跳过 + 低参与。 */
const MAX_PLAYER_EXPOSURE = COVERAGE_OFFERED_TIER_CAP + 1 + 1;
/** pair 覆盖度上界（max*2 + min）→ 归一化分母。 */
const MAX_PAIR_EXPOSURE = MAX_PLAYER_EXPOSURE * 3;

/**
 * pair 覆盖度：两端「覆盖越重越不优先」。
 * 取 `max*2 + min`，保证三段严格有序：
 *   两端都少(0,0)=0 < 一端多一端少(2,0)=4 < 两端都多(2,2)=6。
 * 换算成 [0, COVERAGE_MAX_PENALTY] 的软扣分；两端覆盖度相同时扣分只由共同值决定，
 * 全表覆盖度一致时所有 pair 扣分相同（见 rankPairs 回归断言）。
 */
export function coveragePenalty(a: PlayerCoverage, b: PlayerCoverage): number {
  const ea = coverageExposure(a);
  const eb = coverageExposure(b);
  const hi = Math.max(ea, eb);
  const lo = Math.min(ea, eb);
  const exposure = hi * 2 + lo;
  return (exposure / MAX_PAIR_EXPOSURE) * COVERAGE_MAX_PENALTY;
}

export function scorePair(
  p: { shared: number; compat: number; crowd: number; personal: number; matched: boolean },
  cooldown: number,
  smallPool: boolean,
  coveragePenaltyValue = 0,
): number {
  let s =
    Math.min(p.shared, 1) * 0.5 +
    Math.min(p.compat, 1) * 0.5 +
    Math.min(p.crowd, 2) * 1 +
    Math.min(p.personal, 1) * 2 +
    (p.matched ? 5 : 0);
  if (smallPool) {
    s =
      Math.min(p.shared, 1) * 0.5 +
      Math.min(p.compat, 1) * 0.5 +
      Math.min(p.crowd, 1) * 0.5 +
      Math.min(p.personal, 1) * 1 +
      (p.matched ? 3 : 0);
  }
  return s - (cooldown > 0 ? 4 : 0) - coveragePenaltyValue;
}

/**
 * Player Coverage 表（playerId → PlayerCoverage）；缺省/缺人一律按空 coverage 参与，
 * 不因此产生任何排序变化（空 coverage 扣分恒为 0）。
 */
export type CoverageByPlayer = Record<string, PlayerCoverage>;

/**
 * Pair 路由排序：合法 pair 池先按 Signal/cooldown 打分，再叠加 Coverage 软扣分。
 *
 * @param coverage 可选第 5 参：`relationship.playerCoverage`。缺省 = 空表 = 与改动前逐条一致。
 *
 * 硬边界（不许越界）：
 * - Coverage 只进软扣分，`eligiblePair` 合法性判定路径一行不改：候选 pair 集合与
 *   `coverage` 无关，恒等于空表时的集合（不多不少）。
 * - 扣分上界 0.4 < 最小非零 Signal 步长 0.5，绝不掀翻既有 Signal 语义；全表覆盖度
 *   相同时所有 pair 扣同一常数，排序结果与改动前逐条相同。
 * - 同分仍按 `pairKey` 升序，排序确定性不变。
 *
 * 已知时序差（B2a 只做消费侧接线，不改计数时机，留待 B2b）：
 * reducer 目前在 `REL_CARD_COMPLETED` / `REL_CARD_SKIPPED` 归约时才写 `offeredTargeted`，
 * 而 D7 用户口径是 `CARD_PRESENTED` 即算 offered opportunity。本函数消费的是当前已落盘的
 * Coverage 快照，不改变 offered 的写入时机；这处时序差是已知待办，不在本任务修。
 */
export function rankPairs(
  parts: SessionParticipant[],
  signals: Record<string, { shared: number; compat: number; crowd: number; personal: number }>,
  matchedKeys: Set<string>,
  cooldowns: Record<string, number>,
  coverage: CoverageByPlayer = {},
): string[] {
  const keys: string[] = [];
  const endpoints: Record<string, [string, string]> = {};
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (eligiblePair(parts[i], parts[j])) {
        const k = pairKey(parts[i].playerId, parts[j].playerId);
        keys.push(k);
        endpoints[k] = [parts[i].playerId, parts[j].playerId];
      }
    }
  }
  const smallPool = keys.length <= 6;
  const empty = createEmptyPlayerCoverage();
  const scored: ScoredPair[] = keys.map((k) => {
    const [a, b] = endpoints[k];
    return {
      pairKey: k,
      score: scorePair(
        { ...(signals[k] ?? { shared: 0, compat: 0, crowd: 0, personal: 0 }), matched: matchedKeys.has(k) },
        cooldowns[k] ?? 0,
        smallPool,
        coveragePenalty(coverage[a] ?? empty, coverage[b] ?? empty),
      ),
    };
  });
  scored.sort((a, b) => b.score - a.score || (a.pairKey < b.pairKey ? -1 : 1));
  return scored.map((s) => s.pairKey);
}

/* ------------------------------------------------------------------ */
/* R-CB6｜Single-Anchor 桌识别（1:N, N>=3，薄调度保护，不重写 Router）       */
/* ------------------------------------------------------------------ */

/**
 * 显式触发表（审计 / 测试的唯一真源）：少数方恰 1 人、多数方 ≥3 人 = Single-Anchor 桌。
 *
 * 逐条覆盖用户口径枚举的 1男3女 / 1女3男 / 1男4女 / 1女4男 / 1男5女 / 1女5男，
 * 并按「min==1 && max>=3」同口径延伸到更大的 N（1男6女 / 1女6男…）。
 *
 * 两条缺一不可，故以下桌型一律不触发：
 * - `max < 3`：1男1女（max=1）、1男2女 / 1女2男（max=2）；
 * - `min >= 2`：2男2女 / 2男3女 / 3男2女 / 3男3女…（普通桌，红线：不得误触发）。
 */
export const SINGLE_ANCHOR_TABLE: readonly {
  anchorGender: PairGender;
  /** 少数方人数（用户口径恒为 1）。 */
  anchorCount: number;
  /** 多数方人数下限。 */
  majorityCountMin: number;
}[] = [
  { anchorGender: "male", anchorCount: 1, majorityCountMin: 3 },
  { anchorGender: "female", anchorCount: 1, majorityCountMin: 3 },
];

const oppositeGender = (gender: PairGender): PairGender => (gender === "male" ? "female" : "male");

/**
 * 本局性别计数：只看 `active === true` 且 `pairGender` 已录入的参与者。
 * `pairGender === null`（未选 / 缺失 / 非法）不计入任何一方 —— 绝不猜测、绝不补齐。
 */
export function genderCounts(participants: readonly SessionParticipant[]): {
  male: number;
  female: number;
} {
  let male = 0;
  let female = 0;
  for (const participant of participants) {
    if (participant.active !== true) continue;
    if (participant.pairGender === "male") male += 1;
    else if (participant.pairGender === "female") female += 1;
  }
  return { male, female };
}

/**
 * Single-Anchor 桌的 anchor（少数方唯一玩家）id；普通桌返回 `null`。
 *
 * 命中判据 = `SINGLE_ANCHOR_TABLE` 任一行的 `anchorCount` 与 `majorityCountMin` 同时成立，
 * 故本函数与表同源、可逐条审计（不在别处另写阈值）。
 */
export function singleAnchorPlayerId(participants: readonly SessionParticipant[]): string | null {
  const { male, female } = genderCounts(participants);
  const counts: Record<PairGender, number> = { male, female };
  for (const row of SINGLE_ANCHOR_TABLE) {
    if (
      counts[row.anchorGender] === row.anchorCount &&
      counts[oppositeGender(row.anchorGender)] >= row.majorityCountMin
    ) {
      const anchor = participants.find(
        (participant) => participant.active === true && participant.pairGender === row.anchorGender,
      );
      return anchor?.playerId ?? null;
    }
  }
  return null;
}

/** pairKey（`a::b`，v2-state 口径）是否含该玩家。 */
export const pairKeyIncludesPlayer = (key: string, playerId: string): boolean =>
  key.split("::").includes(playerId);

/**
 * R-CB6/R-CB7 第一层的曝光判定：上一张**已展示**的 targeted（pair opportunity）轮是否涉及 anchor。
 *
 * - `lastTargetedPairKey` 是「上轮展示事实」：定向轮记该 pair key，非定向轮记 `null`；
 * - 普通桌（`anchorPlayerId === null`）恒为 false；
 * - 未出卡 / 非定向轮（`null`）恒为 false —— 曝光只看展示，不看 completed / skipped 终态，
 *   因此 targeted 展示后紧跟 skip 也照样触发 Guard。
 */
export function isSingleAnchorExposed(
  anchorPlayerId: string | null,
  lastTargetedPairKey: string | null | undefined,
): boolean {
  if (anchorPlayerId === null) return false;
  if (!lastTargetedPairKey) return false;
  return pairKeyIncludesPlayer(lastTargetedPairKey, anchorPlayerId);
}
