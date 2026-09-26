/**
 * B7 / D2+D4｜relationship-aware 主线装配（内容路由 + Session 参与者投影 + 主线抽卡）。
 *
 * 职责边界：
 * - 出卡唯一入口是 `drawV2SessionCard(..., createV2MainlineRouter(...))`：本模块不 import
 *   任何旧 selector（card-selector / 指数权重 / 固定 future deck），也不做任何「回退旧 Router」兜底。
 * - 参与者投影与 pair pool 重算走 v2-participants（数据契约层，不拖内容快照）。
 *
 * D4=A：无合法男女 pair 时 `pairMode=NO_ELIGIBLE_PAIR`，只出全桌卡（普通玩法），
 * 不跑 Pair Routing / MATCH / 5 档专属，也不对外暴露任何人的字段值。
 */

import {
  createV2SessionState,
  drawV2SessionCard,
  signalsFromRelationship,
  type V2DrawOutcome,
  type V2PairSignals,
  type V2SessionState,
} from "./v2-session";
import type { RelationshipState, SessionParticipant } from "./v2-state";
import { pairModeFor, type PairMode } from "./v2-participants";
import { createV2MainlineRouter, type V2MainlineRouter } from "./v2-router";

export interface V2MainlineContext {
  readonly packId: string;
  readonly intensityLimit: number;
  readonly pairMode: PairMode;
  readonly state: V2SessionState;
  readonly router: V2MainlineRouter;
}

export interface CreateMainlineContextInput {
  sessionId: string;
  participants: readonly SessionParticipant[];
  /** 当前 relationship-aware 玩法 id。 */
  packId: string;
  /** 当局开放度上限（1–5）。 */
  intensityLimit: number;
  relationship?: RelationshipState;
}

/** 装配一次主线会话上下文：pair pool 每次装配时重算（R4 §3）。 */
export function createMainlineContext(input: CreateMainlineContextInput): V2MainlineContext {
  const participants = [...input.participants];
  const base = createV2SessionState({ sessionId: input.sessionId, participants });
  return {
    packId: input.packId,
    intensityLimit: input.intensityLimit,
    pairMode: pairModeFor(participants),
    state: input.relationship ? { ...base, relationship: input.relationship } : base,
    router: createV2MainlineRouter({ packId: input.packId }),
  };
}

/**
 * 参与者/玩法变化后重算上下文：Host 改性别、暂离/返回、切包、
 * 或 `NO_ELIGIBLE_PAIR → ACTIVE` 恢复（R4 §4.1 退出条件）都走这里。
 */
export function refreshMainlineContext(
  context: V2MainlineContext,
  next: { participants?: readonly SessionParticipant[]; packId?: string; intensityLimit?: number },
): V2MainlineContext {
  const participants = next.participants ? [...next.participants] : [...context.state.participants];
  const packId = next.packId ?? context.packId;
  return {
    packId,
    intensityLimit: next.intensityLimit ?? context.intensityLimit,
    pairMode: pairModeFor(participants),
    state: { ...context.state, participants },
    router: packId === context.packId ? context.router : createV2MainlineRouter({ packId }),
  };
}

export interface DrawMainlineResult {
  context: V2MainlineContext;
  outcome: V2DrawOutcome;
}

/**
 * 主线抽一张：唯一出卡路径 —— v2-session 编排器 + SSOT Router。
 * 路由目标 pair 由 `selectTargetPair` 从 relationship.pairState 派生；无合法 pair 时自动为 null，
 * Router 因此只返回全桌卡（D4 降级），不存在任何回退旧 selector 的分支。
 */
export function drawMainlineCard(
  context: V2MainlineContext,
  options: { signals?: V2PairSignals } = {},
): DrawMainlineResult {
  const outcome = drawV2SessionCard(context.state, context.router, {
    intensityLimit: context.intensityLimit,
    signals: options.signals ?? signalsFromRelationship(context.state.relationship),
  });
  return { context: { ...context, state: outcome.state }, outcome };
}
