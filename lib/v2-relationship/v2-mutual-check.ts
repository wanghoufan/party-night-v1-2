/**
 * B9 / D5｜SYSTEM_MUTUAL_CHECK 私密互选运行控制器（纯内存，UI 无关）。
 *
 * 职责边界：
 * - 触发判定：按 v2-state 口径（`MUTUAL_CHECK_COUNTS` 9/14/19 + R3 mutual due 四道门）
 *   判「现在该不该弹」，且必须 `pairMode=ACTIVE`（D4=A 无合法 pair 一律不弹、不空转）。
 * - run 编排：每位参与者一份 `v2-private` 纯内存 run（按 pairKey），单向选择只写进这些内存对象；
 *   本模块不 import 任何 storage / DB / 日志，单向秘密没有落盘入口。
 * - final（R4 §6.2）：先在内存里算出「允许公开的互选结果」，再清空全部单向数据；
 *   被 D5 上限 2 拦下的 pair 既不建 MATCH、也不以任何形式出现在结果里。
 *
 * 与 reducer 的单一口径：due 四道门与 D5 cap 校验都直接复用 v2-reducer 导出的
 * `mutualDueGates` / `mayCreateMatch`，本模块不复制第二套规则。
 */

import { createId } from "@/lib/utils/create-id";
import {
  beginPrivateRun,
  clearPrivateRun,
  mutualResult,
  submitPrivateChoice,
  type PrivateMutualRun,
} from "./v2-private";
import { eligiblePairKeys, pairModeFor, type PairMode } from "./v2-participants";
import {
  mayCreateMatch,
  mutualDueGates,
  type RelationshipEvent,
} from "./v2-reducer";
import { MUTUAL_CHECK_COUNTS, type RelationshipState, type SessionParticipant } from "./v2-state";

/** 一位参与者对某条 pair 的「我选 TA」标记：同 run 双方写同值才构成互选。 */
const MUTUAL_PICK = "mutual-pick";

/* ------------------------------------------------------------------ */
/* 触发判定                                                              */
/* ------------------------------------------------------------------ */

export type MutualCheckTriggerReason =
  /** 该弹。 */
  | "ok"
  /** D4=A：无合法男女 pair（含人数不足/全未选/单目标性别）→ 不创建 run、不空转。 */
  | "no-eligible-pair"
  /** 当前 relationshipEffectiveCardCount 不在 9/14/19 检查点上（含已消耗过的那一档）。 */
  | "not-at-checkpoint"
  /** 到了检查点但 R3 四道门未过（剩余轮次/整局次数/最小间隔）。 */
  | "gates-not-passed"
  /** 本局已暂停/结束：私密流程不开始。 */
  | "session-not-running";

export interface MutualCheckTriggerInput {
  relationship: RelationshipState;
  participants: readonly SessionParticipant[];
  /** Session 状态；只有 `active` 视为 RUNNING（R4 §7.1）。 */
  sessionStatus: "generating" | "active" | "paused" | "finished";
  /** 是否已有别的私密流程在跑（本流程自身运行时为 true）。 */
  privateFlowRunning?: boolean;
}

export interface MutualCheckTrigger {
  due: boolean;
  /** 命中的常规互选检查点（9/14/19）；未命中为 null。 */
  checkpoint: number | null;
  pairMode: PairMode;
  reason: MutualCheckTriggerReason;
}

/** 该不该弹私密互选：v2-state 口径 + 合法 pair + Session RUNNING + 无并行私密流程。 */
export function mutualCheckTrigger(input: MutualCheckTriggerInput): MutualCheckTrigger {
  const pairMode = pairModeFor(input.participants);
  const count = input.relationship.relationshipEffectiveCardCount;
  const checkpoint = (MUTUAL_CHECK_COUNTS as readonly number[]).includes(count) ? count : null;

  if (pairMode !== "ACTIVE") {
    return { due: false, checkpoint, pairMode, reason: "no-eligible-pair" };
  }
  if (checkpoint === null) {
    return { due: false, checkpoint: null, pairMode, reason: "not-at-checkpoint" };
  }
  if (input.sessionStatus !== "active" || input.privateFlowRunning === true) {
    return { due: false, checkpoint, pairMode, reason: "session-not-running" };
  }
  if (!mutualDueGates(input.relationship, checkpoint)) {
    return { due: false, checkpoint, pairMode, reason: "gates-not-passed" };
  }
  return { due: true, checkpoint, pairMode, reason: "ok" };
}

/* ------------------------------------------------------------------ */
/* run（纯内存）                                                          */
/* ------------------------------------------------------------------ */

export interface MutualCheckRun {
  runId: string;
  /** 本 run 的候选人（点名顺序 = participants 顺序，且至少属于一条合法边）。 */
  playerIds: readonly string[];
  /** pairKey → 该 pair 的纯内存私密 run；离开本 run 即整体丢弃。 */
  pairRuns: Record<string, PrivateMutualRun>;
}

/** 候选人 = 至少属于一条合法 eligible 边的参与者（R4 §7.1 mutualCandidateCount 口径）。 */
export function mutualCandidateIds(
  participants: readonly SessionParticipant[],
  pairKeys: readonly string[] = eligiblePairKeys(participants),
): string[] {
  const inPair = new Set(pairKeys.flatMap((key) => key.split("::")));
  return participants
    .filter((participant) => participant.active && inPair.has(participant.playerId))
    .map((participant) => participant.playerId);
}

/** 建立一次 mutual run：无合法 pair 时 pairRuns/candidates 为空（调用方不得弹）。 */
export function beginMutualCheckRun(participants: readonly SessionParticipant[]): MutualCheckRun {
  const pairKeys = eligiblePairKeys(participants);
  const pairRuns: Record<string, PrivateMutualRun> = {};
  for (const key of pairKeys) {
    const [first, second] = key.split("::") as [string, string];
    pairRuns[key] = beginPrivateRun(key, [first, second]);
  }
  return {
    runId: createId(),
    playerIds: mutualCandidateIds(participants, pairKeys),
    pairRuns,
  };
}

/**
 * 记一位参与者的单向选择：只选一人或跳过（null）。
 *
 * 只写内存：涉及的每条 pair run 里，本人一侧记为「我选 TA」（选中的那条 pair）或 null（其余）。
 * 非法目标（选自己 / 不在候选人里）一律按跳过处理，不抛错、不写任何痕迹。
 */
export function submitMutualChoice(
  run: MutualCheckRun,
  playerId: string,
  targetPlayerId: string | null,
): MutualCheckRun {
  if (!run.playerIds.includes(playerId)) return run;
  const target = targetPlayerId !== null && run.playerIds.includes(targetPlayerId) && targetPlayerId !== playerId
    ? targetPlayerId
    : null;
  for (const [key, pairRun] of Object.entries(run.pairRuns)) {
    const [first, second] = key.split("::") as [string, string];
    if (playerId !== first && playerId !== second) continue;
    const partner = playerId === first ? second : first;
    submitPrivateChoice(pairRun, playerId, target === partner ? MUTUAL_PICK : null);
  }
  return run;
}

/** 只允许公开的互选结果：仅「双方互选且未被 D5 上限拦下」的 pair。 */
export interface MutualCheckPublicResult {
  matches: { pairKey: string; playerIds: [string, string] }[];
}

/**
 * 收束一次 mutual run（R4 §6.2 `FINALIZED / mutual-final`）：
 * 1. 先在内存里算出允许公开的结果集（双方互选 ∩ 本次新成立 ∩ D5 cap 校验通过）；
 * 2. 立即清空所有单向数据（含未选中的一侧、draft 痕迹、遮罩态）。
 * 被上限拦下或单向未成的 pair 一律不进结果，返回值不含任何单向明细。
 *
 * 「本次新成立」：`relationship.matches[pairKey]` 已是 MATCH 的 pair 不再作为本次新互选公布
 * （否则同一对会被当成「又互选成功」重复公布、重复建 COMPLETE 事件）。原 MATCH 原样保留；
 * reducer 侧 `mayCreateMatch` 对已存在 pair 的幂等语义不变，这里只收窄「公开面」。
 */
export function finalizeMutualCheckRun(
  run: MutualCheckRun,
  relationship: RelationshipState,
): MutualCheckPublicResult {
  const matches: MutualCheckPublicResult["matches"] = [];
  for (const [key, pairRun] of Object.entries(run.pairRuns).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!mutualResult(pairRun).match) continue;
    if (relationship.matches[key] !== undefined) continue;
    const [first, second] = key.split("::") as [string, string];
    if (!mayCreateMatch(relationship.matches, [first, second], key)) continue;
    matches.push({ pairKey: key, playerIds: [first, second] });
  }
  clearMutualCheckRun(run);
  return { matches };
}

/** 清空一次 run 的全部单向痕迹并关闭遮罩；调用方随后丢弃引用即可（无落盘入口）。 */
export function clearMutualCheckRun(run: MutualCheckRun): void {
  for (const pairRun of Object.values(run.pairRuns)) clearPrivateRun(pairRun);
}

/* ------------------------------------------------------------------ */
/* 落盘事件计划（只含公开结果与 due 标记，不含任何单向数据）                   */
/* ------------------------------------------------------------------ */

/**
 * finalize 后要归约的 R3 事件：
 * - 一条 `SYSTEM_MUTUAL_CHECK_DUE`：把本次常规互选记为已完成（四道门在 reducer 内复核，重放安全）；
 * - 每个新 MATCH 一条 `SYSTEM_MUTUAL_CHECK_COMPLETE`（`consented=true`），由 reducer 原子建 MATCH + cooldown。
 * 事件里只有 pairKey / playerIds 等公开信息，绝不携带「谁选了什么 / 谁跳过了」。
 */
export function mutualCheckFinalEvents(
  runId: string,
  checkpoint: number,
  result: MutualCheckPublicResult,
  timestamp: string,
): RelationshipEvent[] {
  return [
    {
      eventId: `${runId}::due`,
      type: "SYSTEM_MUTUAL_CHECK_DUE",
      dueCount: checkpoint,
      timestamp,
    },
    ...result.matches.map((match) => ({
      eventId: `${runId}::match::${match.pairKey}`,
      type: "SYSTEM_MUTUAL_CHECK_COMPLETE" as const,
      pairKey: match.pairKey,
      playerIds: match.playerIds,
      consented: true,
      timestamp,
    })),
  ];
}
