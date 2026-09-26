"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  beginMutualCheckRun,
  clearMutualCheckRun,
  finalizeMutualCheckRun,
  mutualPartnerIds,
  submitMutualChoice,
  MUTUAL_SINGLE_CANDIDATE_NO,
  MUTUAL_SINGLE_CANDIDATE_PROMPT,
  MUTUAL_SINGLE_CANDIDATE_YES,
  MUTUAL_STALE_TARGET_NOTICE,
  type MutualCheckPublicResult,
  type MutualCheckRun,
} from "@/lib/v2-relationship/v2-mutual-check";
import type { RelationshipState, SessionParticipant } from "@/lib/v2-relationship/v2-state";

/**
 * B9 / D5｜SYSTEM_MUTUAL_CHECK 私密互选面板（单设备传手机，R4 §5 状态机）。
 *
 * 隐私约束（逐条对应 R4 §5.1 / §7.2）：
 * - 每位参与者只走 `HANDOFF → IDENTITY → READY → SELECT/跳过 → SUBMITTED/MASKED → NEXT`，
 *   不提供上一步；下一位必须从点名遮罩重新起步，绝不直达选择页，也不复用上一位的选中态。
 * - 提交是原子转换：先清空当次 draft 与选中态，再显示「已提交」（不回显答案）。
 * - 全程只有「双方互选」的结果才公开；跳过、单向、被 D5 上限拦下一律不显示、不留痕。
 * - 单向秘密只活在 `v2-mutual-check`（纯内存）里，本组件不 import 任何持久化模块，
 *   不写入浏览器本地存储、离线库、URL 或日志。
 */

/** 交接状态机（R4 §5.1 单向链；无上一步）。 */
type Step =
  | "HANDOFF"
  | "IDENTITY"
  | "READY"
  | "SELECT"
  | "SUBMITTED"
  | "MASKED"
  | "NEXT"
  | "RESULTS"
  | "MISMATCH";

export interface MutualCheckPlayer {
  id: string;
  displayName: string;
}

export interface MutualCheckSheetProps {
  open: boolean;
  /** 候选人（点名顺序），由调用方按 `mutualCandidateIds` 生成。 */
  players: readonly MutualCheckPlayer[];
  /** 当局参与者投影（用于按 eligiblePair 建 run）。 */
  participants: readonly SessionParticipant[];
  /** 命中的常规互选检查点（9/14/19）。 */
  checkpoint: number;
  /** 现有关系态：finalize 时做 D5 上限 2 校验。 */
  relationship: RelationshipState;
  /** 流程收束（结果已公布之后）；入参只含公开结果。 */
  onFinished: (result: { runId: string; checkpoint: number; matches: MutualCheckPublicResult["matches"] }) => void;
  /** Host 取消 / 身份不符收场：不产生结果、不计一次常规互选、不公开任何人。 */
  onCancelled: () => void;
}

export function MutualCheckSheet({
  open,
  players,
  participants,
  checkpoint,
  relationship,
  onFinished,
  onCancelled,
}: MutualCheckSheetProps) {
  const runRef = useRef<MutualCheckRun | null>(null);
  // participants / relationship 每次渲染都可能换引用：run 建立时读最新值。
  const participantsRef = useRef(participants);
  const relationshipRef = useRef(relationship);
  const [step, setStep] = useState<Step>("HANDOFF");
  const [cursor, setCursor] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<MutualCheckPublicResult | null>(null);
  /**
   * 当前玩家进入选择页时定格的合法候选快照（R-CB9）。
   * 定格只为了让位给「单一候选 → Yes/No」这一个稳定视图；提交前仍会用最新参与者再校验一次边合法性，
   * 所以快照过期不会造成非法选择落盘。
   */
  const [candidates, setCandidates] = useState<readonly string[]>([]);
  const [staleNotice, setStaleNotice] = useState("");

  useEffect(() => {
    participantsRef.current = participants;
    relationshipRef.current = relationship;
  }, [participants, relationship]);

  // 关闭 / 卸载即清空内存里的单向数据（只动 ref，不触发渲染）：本面板每次 run 由调用方重新挂载。
  useEffect(() => {
    if (!open) return;
    return () => {
      if (runRef.current) {
        clearMutualCheckRun(runRef.current);
        runRef.current = null;
      }
    };
  }, [open]);

  if (!open || typeof document === "undefined" || players.length === 0) return null;

  const current = players[Math.min(cursor, players.length - 1)]!;
  const last = cursor >= players.length - 1;
  const nameOf = (playerId: string) => players.find((player) => player.id === playerId)?.displayName ?? playerId;

  /** run 懒建立：直到第一位真正提交前，内存里不存在任何单向数据。 */
  function ensureRun(): MutualCheckRun {
    runRef.current ??= beginMutualCheckRun(participantsRef.current);
    return runRef.current;
  }

  /** 某玩家此刻的合法异性候选（从真实 eligible pair 池派生，与 Guard 阈值无关）。 */
  const legalCandidates = (playerId: string): string[] => mutualPartnerIds(playerId, participantsRef.current);

  /** 进入选择页：把此刻的合法候选定格为本人的候选快照（单一候选才走 Yes/No 视图）。 */
  function enterSelect() {
    setPending(null);
    setStaleNotice("");
    setCandidates(legalCandidates(current.id));
    setStep("SELECT");
  }

  /**
   * 收一位参与者的选择并推进状态链。
   * 离开 PRIVATE_SELECT / READY 前先清掉当次 draft 与选中态（R4 §5.1 不变式 7）。
   */
  function completePerson(targetPlayerId: string | null, skipped: boolean) {
    const run = ensureRun();
    setPending(null);
    submitMutualChoice(run, current.id, targetPlayerId);
    if (last) {
      // 最后一位提交即 mutual final：先算公开结果，随即清空全部单向数据（R4 §6.2）。
      setResult(finalizeMutualCheckRun(run, relationshipRef.current));
    }
    setStep(skipped ? "MASKED" : "SUBMITTED");
  }

  /**
   * 提交前边合法校验（R-CB9 已知风险）：作答期间候选可能暂离/变化，快照里的目标可能已经失效。
   * 失效则拒绝提交、只给可读提示，绝不把非法目标送进 `submitMutualChoice`。
   */
  function submitChoice(targetPlayerId: string | null) {
    if (targetPlayerId !== null && !legalCandidates(current.id).includes(targetPlayerId)) {
      setPending(null);
      setStaleNotice(MUTUAL_STALE_TARGET_NOTICE);
      return;
    }
    completePerson(targetPlayerId, false);
  }

  function nextPerson() {
    setPending(null);
    if (last) {
      setStep("RESULTS");
      return;
    }
    setCursor((value) => value + 1);
    setStep("HANDOFF");
  }

  function cancel() {
    const run = runRef.current;
    if (run) clearMutualCheckRun(run);
    runRef.current = null;
    onCancelled();
  }

  function finish() {
    const run = runRef.current;
    if (!run) {
      onCancelled();
      return;
    }
    const matches = result?.matches ?? [];
    runRef.current = null;
    onFinished({ runId: run.runId, checkpoint, matches });
  }

  const panel = (label: string, children: ReactNode) => (
    <section className="mutual-mask" role="dialog" aria-modal="true" aria-label={label}>
      <p className="mutual-mask__eyebrow"><Icon name="eye" /> 私密互选 · 手机传阅</p>
      {children}
    </section>
  );

  const maskNote = <p className="mutual-mask__note">请勿截屏、转发或让旁人旁观。</p>;

  const stepView = (): ReactNode => {
    switch (step) {
      case "HANDOFF":
        return panel("私密互选", <>
          <h2>请把手机交给 {current.displayName}</h2>
          <p className="mutual-mask__body">手机不在你手上时，请不要看屏幕。</p>
          {maskNote}
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={cancel}>取消本轮</Button>
            <Button type="button" onClick={() => setStep("IDENTITY")}>已交给 TA</Button>
          </div>
        </>);
      case "IDENTITY":
        return panel("确认身份", <>
          <h2>你是 {current.displayName} 吗？</h2>
          <p className="mutual-mask__body">确认是本人再继续；不是本人请直接交还主持人。</p>
          <p className="mutual-mask__note">确认前不会显示任何题目或选项。</p>
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={() => { setPending(null); setStep("MISMATCH"); }}>不是，交还主持人</Button>
            <Button type="button" onClick={() => setStep("READY")}>是，继续</Button>
          </div>
        </>);
      case "READY":
        return panel("准备好后再点开", <>
          <h2>准备好后再点开</h2>
          <p className="mutual-mask__body">请不要让其他人看屏幕。可以跳过，跳过不会有任何惩罚。</p>
          {maskNote}
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={() => completePerson(null, true)}>跳过</Button>
            <Button type="button" onClick={enterSelect}>我准备好了</Button>
          </div>
        </>);
      case "SELECT": {
        // R-CB9：分支只看「本人当前合法异性候选数」，与 Single-Anchor Guard 阈值解耦。
        if (candidates.length === 0) {
          return panel("选择你想进一步认识的人", <>
            <h2>暂时没有可选的人</h2>
            <p className="mutual-mask__body">{MUTUAL_STALE_TARGET_NOTICE}</p>
            {maskNote}
            <div className="mutual-mask__actions">
              <Button variant="ghost" type="button" onClick={() => completePerson(null, true)}>跳过</Button>
            </div>
          </>);
        }
        if (candidates.length === 1) {
          // 唯一合法候选：Yes/No 两选项，唯一候选 → 愿意；null → 暂时没有（映射既有 mutual choice）。
          const partnerId = candidates[0]!;
          return panel("选择你想进一步认识的人", <>
            <h2>{MUTUAL_SINGLE_CANDIDATE_PROMPT}</h2>
            <p className="mutual-mask__body">只有你们互相愿意才会公布结果；暂时没有不影响游戏，也不会有任何惩罚。</p>
            {staleNotice && <p className="mutual-mask__note" role="alert">{staleNotice}</p>}
            {maskNote}
            <div className="mutual-mask__actions">
              <Button variant="ghost" type="button" onClick={() => submitChoice(null)}>{MUTUAL_SINGLE_CANDIDATE_NO}</Button>
              <Button type="button" onClick={() => submitChoice(partnerId)}>{MUTUAL_SINGLE_CANDIDATE_YES}</Button>
            </div>
          </>);
        }
        return panel("选择你想进一步认识的人", <>
          <h2>只选一个人，或跳过</h2>
          <div className="mutual-choice-list">
            {candidates.map((playerId) => (
              <button
                key={playerId}
                type="button"
                className={`mutual-choice${pending === playerId ? " mutual-choice--on" : ""}`}
                aria-pressed={pending === playerId}
                onClick={() => setPending(playerId)}
              >
                {nameOf(playerId)}
              </button>
            ))}
          </div>
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={() => completePerson(null, true)}>跳过</Button>
            <Button type="button" disabled={pending === null} onClick={() => submitChoice(pending)}>提交</Button>
          </div>
          {staleNotice && <p className="mutual-mask__note" role="alert">{staleNotice}</p>}
          <p className="mutual-mask__note">只有你们互相选中彼此才会公布结果；其余情况不会显示，也不影响游戏。</p>
        </>);
      }
      case "SUBMITTED":
        return panel("已提交", <>
          <h2>已提交</h2>
          <p className="mutual-mask__body">答案已收起，不会回显。</p>
          {maskNote}
          <div className="mutual-mask__actions">
            <Button type="button" onClick={() => { setPending(null); setStep("MASKED"); }}>继续</Button>
          </div>
        </>);
      case "MASKED":
        return panel("答案已隐藏", <>
          <h2>答案已隐藏</h2>
          <p className="mutual-mask__body">请确认旁人看不到屏幕后，再交给下一位。</p>
          {maskNote}
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={cancel}>取消本轮</Button>
            <Button type="button" onClick={() => { setPending(null); setStep("NEXT"); }}>已遮好</Button>
          </div>
        </>);
      case "NEXT":
        return panel("交接下一位", <>
          <h2>{last ? "请把手机交还主持人" : "请把手机交给下一位"}</h2>
          <p className="mutual-mask__body">交接时保持遮罩，不要让别人看到屏幕。</p>
          <p className="mutual-mask__note">下一步会重新点名确认身份。</p>
          <div className="mutual-mask__actions">
            <Button variant="ghost" type="button" onClick={cancel}>取消本轮</Button>
            <Button type="button" onClick={nextPerson}>继续</Button>
          </div>
        </>);
      case "MISMATCH":
        return panel("请交还主持人", <>
          <h2>请交还主持人</h2>
          <p className="mutual-mask__body">本次私密互动到此为止，不会公开任何人的选择。</p>
          <p className="mutual-mask__note">继续游戏即可。</p>
          <div className="mutual-mask__actions">
            <Button type="button" onClick={cancel}>结束本轮私密互动</Button>
          </div>
        </>);
      case "RESULTS":
        return panel("互选结果", <>
          {result && result.matches.length > 0 ? (
            <>
              <h2>互选成功</h2>
              <ul className="mutual-result">
                {result.matches.map((match) => (
                  <li key={match.pairKey}>{nameOf(match.playerIds[0])} × {nameOf(match.playerIds[1])}</li>
                ))}
              </ul>
            </>
          ) : (
            <h2>本轮已完成，继续游戏</h2>
          )}
          <p className="mutual-mask__note">只有双方互相选中才会公布；其余情况不显示、不影响游戏，跳过也一样。</p>
          <div className="mutual-mask__actions">
            <Button type="button" onClick={finish}>继续游戏</Button>
          </div>
        </>);
    }
  };

  return createPortal(
    <div className="mutual-backdrop" role="presentation">{stepView()}</div>,
    document.body,
  );
}
