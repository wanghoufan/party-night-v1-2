/**
 * B7 / D4｜Session 参与者投影与 Pair 模式（不依赖内容真源，可在任何读取路径安全引用）。
 *
 * 为什么单独一层：Session 创建（session-engine）与旧 Session 读取（session-migration）只需要
 * 「players → participants」这条数据契约，不该把 350+40 的内容快照拖进它们的依赖图。
 *
 * D4=A 口径：
 * - `pairGender` 只存在当局 Session 上，绝不回写 Player 档案，也不进 analytics / AI / 日志 / 导出；
 * - 未选、缺失、非法枚举一律 `null`（不猜、不修正、不阻止恢复）；
 * - 无合法男女 pair → `NO_ELIGIBLE_PAIR`（普通玩法降级），界面只给中性提示，不暴露字段值。
 */

import type { GameSession, Player } from "@/lib/domain/schemas";
import { rankPairs } from "./v2-routing";
import { normalizePairGender, type PairGender, type SessionParticipant } from "./v2-state";

/** R4 §3：Pair 模式派生态。 */
export type PairMode = "ACTIVE" | "NO_ELIGIBLE_PAIR";

/** R4 §4.1 的界面中性提示：只说用普通玩法，不公开任何人的字段值。 */
export const NO_ELIGIBLE_PAIR_HINT = "本局将使用普通玩法";

/** 当局性别输入：playerId → 男/女/未选（null）。Host 只为本局选择，不落 Player 档案。 */
export type PairGenderInput = Record<string, PairGender | null | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Host 输入 → 当局参与者投影（未选/缺省一律 null，不猜）。 */
export function createSessionParticipants(
  players: readonly Player[],
  genders: PairGenderInput = {},
): SessionParticipant[] {
  return players.map((player) => ({
    playerId: player.id,
    active: player.active,
    pairGender: normalizePairGender(genders[player.id]),
  }));
}

/**
 * 读取路径的幂等规范化（R4 §2.3 迁移契约）：
 * - 缺 `participants`（旧 Session）→ 按 config.players 补全，`pairGender=null`，不阻止恢复；
 * - 非法枚举值 → `null`；重复 playerId 取首条；悬空 playerId（不在本局 players 里）丢弃；
 * - 已存在条目保留其 `active`（当局真值），顺序恒等于 config.players 顺序 → 重复执行结果不变。
 */
export function normalizeParticipants(
  raw: unknown,
  players: readonly Player[],
): SessionParticipant[] {
  const existing = new Map<string, SessionParticipant>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      const playerId = entry.playerId;
      if (typeof playerId !== "string" || !playerId || existing.has(playerId)) continue;
      existing.set(playerId, {
        playerId,
        active: entry.active === true,
        pairGender: normalizePairGender(entry.pairGender),
      });
    }
  }
  return players.map((player) => {
    const found = existing.get(player.id);
    return found ?? { playerId: player.id, active: player.active, pairGender: null };
  });
}

/** 幂等补齐 Session 的当局参与者投影（Session 创建与旧 Session 读取共用）。 */
export function withSessionParticipants(session: GameSession): GameSession {
  return { ...session, participants: normalizeParticipants(session.participants, session.config.players) };
}

/* ------------------------------------------------------------------ */
/* R4 §4.3 / §4.4：玩家名册变更的三分语义（EXIT / AWAY / RETURN）            */
/* ------------------------------------------------------------------ */

/** 一次名册变更按 R4 语义分类的结果；退出是终止、暂离是暂停，两者不得共用恢复语义。 */
export interface PlayerRosterTransition {
  /** 真离开当局（不再出现在名册里）→ 终止语义：删边、保障 `expired`、释放 D5 名额。 */
  exited: readonly string[];
  /** 暂离（仍在名册，`active` 由在场变非在场）→ 暂停语义：signal/MATCH/cooldown 保留。 */
  away: readonly string[];
  /** 回席（仍在名册，`active` 由非在场变在场）→ 从暂停点继续，不补算离席期机会。 */
  returned: readonly string[];
}

/**
 * 名册前后差 → 三分语义（唯一口径，禁止把 `active=false` 一刀切）：
 * - 旧名册有、新名册没有 → `exited`（真离开）；
 * - 两边都在且 `active` 由 true 变 false → `away`（暂离）；
 * - 两边都在且 `active` 由 false 变 true → `returned`（回席）；
 * - 新名册新增的玩家（旧名册里没有）不算任何迁移：他没有历史边，按新参与者处理；
 * - 改名 / 改 `lastUsedAt` 等不产生任何迁移。
 */
export function diffPlayerRoster(
  previous: readonly Player[],
  next: readonly Player[],
): PlayerRosterTransition {
  const nextById = new Map(next.map((player) => [player.id, player]));
  const exited: string[] = [];
  const away: string[] = [];
  const returned: string[] = [];
  for (const player of previous) {
    const updated = nextById.get(player.id);
    if (!updated) {
      exited.push(player.id);
    } else if (player.active && !updated.active) {
      away.push(player.id);
    } else if (!player.active && updated.active) {
      returned.push(player.id);
    }
  }
  return { exited, away, returned };
}

/** 全部合法无向边（pairKey，升序去重）：R4 §2.2 pair pool。 */
export function eligiblePairKeys(participants: readonly SessionParticipant[]): string[] {
  return rankPairs([...participants], {}, new Set(), {});
}

/** pair pool 是否为空 → ACTIVE / NO_ELIGIBLE_PAIR（含单目标性别、全员未选、人数不足）。 */
export function pairModeFor(participants: readonly SessionParticipant[]): PairMode {
  return eligiblePairKeys(participants).length > 0 ? "ACTIVE" : "NO_ELIGIBLE_PAIR";
}
