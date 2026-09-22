"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";

/** 旋转动画时长：与 CSS 过渡一致，只是表演，不参与选人（Plan 8.4）。 */
export const SPIN_MS = 1100;
/** 每次旋转都多转两圈再停在 target 座位上，方向永远由“已定下的结果”决定。 */
const FULL_TURNS = 2;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 主局传给转瓶子的上下文：玩家名单 + 上一次落点 + 链相位 + 两个回调（抽人 / 链入真心话大冒险）。 */
export interface SpinBottleHandlers {
  players: Player[];
  /** 上一次落点：刷新后据此直接回到结果页，同时交给 selector 避免连续指同一人。 */
  lastSelectedPlayerId?: string;
  /** 链刚回到瓶子（phase=returning）：直接进 ready，不复播上一轮结果页（V1.5）。 */
  resumeReady?: boolean;
  /** 真心话与大冒险都出完了：ready 态显示空态提示，不再链入（V1.5）。 */
  exhausted?: boolean;
  /** 补位后还能出题的类型（空牌堆也按补位后算）：两类都还出得了就不禁任何一边（V1.6 L1 洗牌不断游）。 */
  availableKinds?: Array<"truth" | "dare">;
  /** 新卡已出完、这次进去要走 L1 从头洗牌（题目会重复）的类型：结果页给一句可见提示。 */
  recycledKinds?: Array<"truth" | "dare">;
  /** 先定结果再播动画：同步返回本次落点（主局负责落库），没有在场玩家时返回 undefined。 */
  onSpin: () => Player | undefined;
  /** 结果页去向：链入现有真心话大冒险 Pack，不复制它的出题逻辑。 */
  onChain: (kind: "truth" | "dare") => void;
}

export interface SpinBottleProps {
  spin: SpinBottleHandlers;
  /** 局中暂停：旋转冻结在当前角度，恢复后接着转完（V1.5 顶栏暂停）。 */
  paused?: boolean;
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;
  query?.addEventListener("change", onStoreChange);
  return () => query?.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * 座位环半径：2–8 人用同一个对称半径；9 人以上按人数放宽、字号收小，避免名字叠在一起（V1.5）。
 * 两种口径都以顶部为 0°，每人间隔 360/n，天然左右对称。
 * 半径下限 5.4rem：扣掉中央瓶子半径（2.3rem）后，60°/120°/240°/300° 四个斜向座位仍留出净空，
 * 配合 `.spin-bottle__seat` 的 max-width 兜底，任何昵称长度都不会被瓶子圆吃掉（V1.5 宽屏热修）。
 */
export function seatRing(count: number): { radius: string; dense: boolean } {
  if (count > 12) return { radius: "7.8rem", dense: true };
  if (count > 8) return { radius: "6.4rem", dense: true };
  return { radius: "5.4rem", dense: false };
}

/**
 * 转瓶子视图（Plan 8.4 / US6 / T151，V1.5 视觉重做）：点击开始 → 结果先由主局定下并落库 → 播放指向该人的动画 → 结果页。
 * 只从在场玩家中选人；被指到的人保留在结果页，可链入真心话/大冒险，或再转一次。
 * 刷新只恢复最终落点，不复播半截动画；reduced-motion 下不等待旋转。
 * 落点用**目标座位的光环 + aria-current**表达（已删掉旧的 ▲ 指针），中央瓶子本体旋转指向目标。
 */
export function SpinBottleView({ spin, paused = false }: SpinBottleProps) {
  const active = spin.players.filter((player) => player.active);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  // 结果页两个去向：L1 洗牌后两类通常都还能出，只有整类被雷区/尺度挡掉才真禁用并提示（V1.6）。
  const availableKinds = spin.availableKinds ?? ["truth", "dare"];
  const truthReady = availableKinds.includes("truth");
  const dareReady = availableKinds.includes("dare");
  const kindName = (kind: "truth" | "dare") => (kind === "truth" ? "真心话" : "大冒险");
  const repeats = (spin.recycledKinds ?? []).filter((kind) => availableKinds.includes(kind));
  const exhaustHint = !truthReady && !dareReady ? "真心话和大冒险的题卡都出完了，回瓶子再转一次点人吧"
    : repeats.length ? `${repeats.map(kindName).join("和")}的新题出过一轮了，接下来会从头再来（题目会重复）`
      : !truthReady ? "真心话出完了，试试大冒险或再转一次"
        : !dareReady ? "大冒险出完了，试试真心话或再转一次"
          : undefined;
  // 链刚返回时强制 ready：主持人接着转下一个人，而不是又看见上一位的结果页。
  const restored = spin.resumeReady ? undefined : active.find((player) => player.id === spin.lastSelectedPlayerId);
  const [target, setTarget] = useState<Player | undefined>(restored);
  const [phase, setPhase] = useState<"ready" | "spinning" | "result">(restored ? "result" : "ready");
  const [turn, setTurn] = useState(0);
  const remainingRef = useRef(SPIN_MS);

  useEffect(() => {
    if (phase !== "spinning" || paused) return;
    const remaining = remainingRef.current;
    const deadline = Date.now() + remaining;
    const timer = window.setTimeout(() => setPhase("result"), remaining);
    return () => { remainingRef.current = Math.max(0, deadline - Date.now()); window.clearTimeout(timer); };
  }, [phase, paused]);

  function start() {
    if (phase === "spinning") return;
    const picked = spin.onSpin();
    if (!picked) return;
    remainingRef.current = SPIN_MS;
    setTarget(picked);
    setTurn((value) => value + 1);
    setPhase(reducedMotion ? "result" : "spinning");
  }

  const ring = seatRing(active.length);
  const seatAngle = (index: number) => (active.length ? Math.round((360 / active.length) * index) : 0);
  const targetIndex = target ? active.findIndex((player) => player.id === target.id) : -1;
  const angle = targetIndex >= 0 ? turn * 360 * FULL_TURNS + seatAngle(targetIndex) : 0;
  const spinning = phase === "spinning";

  return (
    <article className="game-card game-card--spin-bottle spin-bottle" data-phase={phase} data-target-player-id={target?.id ?? ""}>
      <span className="game-card__crown" aria-hidden="true">♔</span>
      <div className="game-card__pack"><Icon name="bottle" />转瓶子</div>

      <div className={`spin-bottle__stage${ring.dense ? " spin-bottle__stage--dense" : ""}`} style={{ "--seat-radius": ring.radius } as CSSProperties}>
        <ul className="spin-bottle__seats">
          {active.map((player, index) => {
            const on = target?.id === player.id;
            return (
              <li
                className={`spin-bottle__seat${on ? " spin-bottle__seat--on" : ""}`}
                key={player.id}
                aria-current={on ? "true" : undefined}
                style={{ "--seat-angle": `${seatAngle(index)}deg` } as CSSProperties}
              >
                {player.displayName}
              </li>
            );
          })}
        </ul>
        {/* 中央瓶子本体旋转：角度由已定下的 target 座位算出，转完正好把瓶颈指向那个人。 */}
        <div className="spin-bottle__pointer" aria-hidden="true" style={{ "--spin-angle": `${angle}deg` } as CSSProperties}>
          <span className="spin-bottle__bottle"><Icon name="bottle" /></span>
        </div>
      </div>

      {phase !== "result" && (
        <p className="spin-bottle__hint" role="status">
          {spinning ? "转动中…" : spin.exhausted ? "真心话和大冒险的题卡都用完了，继续转瓶子点人吧" : active.length ? "点一下，瓶子会指向今晚的一个人" : "至少需要 2 名在场玩家"}
        </p>
      )}
      {phase !== "result" && (
        <div className="spin-bottle__controls">
          <Button type="button" disabled={spinning || !active.length} onClick={start}><Icon name="refresh" />开始旋转</Button>
        </div>
      )}
      {phase === "result" && target && (
        <div className="spin-bottle__result">
          <p className="spin-bottle__target" role="status">🎯 {target.displayName}</p>
          {exhaustHint && <p className="spin-bottle__exhausted" role="status">{exhaustHint}</p>}
          <div className="spin-bottle__choices">
            <Button type="button" disabled={spinning || !truthReady} onClick={() => spin.onChain("truth")}>真心话</Button>
            <Button type="button" disabled={spinning || !dareReady} onClick={() => spin.onChain("dare")}>大冒险</Button>
          </div>
          <Button className="spin-bottle__again" variant="secondary" type="button" disabled={spinning} onClick={start}><Icon name="refresh" />再转一次</Button>
        </div>
      )}
      <span className="game-card__source">纯本地随机 · 不联网</span>
    </article>
  );
}
