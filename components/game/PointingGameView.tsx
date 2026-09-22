"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RoundActions } from "@/components/game/RoundActions";
import type { PackViewProps } from "@/components/game/PackViewHost";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { GameCard } from "@/lib/domain/schemas";

const COUNTDOWN_FROM = 3;
const TICK_MS = 1000;

const sourceLabel = (source: GameCard["source"]) => (source === "ai" ? "AI 生成" : source === "custom" ? "自定义" : "本地题库");

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;
  query?.addEventListener("change", onStoreChange);
  return () => query?.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * 指人游戏视图（Plan 8.2 / US4）：一句直接指令 → 准备 → 3 · 2 · 1 → 👉 指。
 * 结果留在桌上：不统计票数、不采集任何逐人输入，指完用「下一题 / 换一个」继续（FR-019）。
 * 倒计时只是节奏引导，不是门槛：系统开了“减少动态效果”时不逐秒等待，直接进入「指」。
 * V1.5：倒计时收成 44–48px 小徽章（舞台固定高度，切换阶段不跳版）；局中暂停时倒数冻结。
 */
export function PointingGameView({ card, participantNames, actions, paused = false }: PackViewProps) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const [phase, setPhase] = useState<"ready" | "counting" | "point">("ready");
  const [count, setCount] = useState(COUNTDOWN_FROM);

  useEffect(() => {
    // 暂停＝倒数冻结：不排下一个 tick，恢复后从当前秒继续，不重头数。
    if (phase !== "counting" || paused) return;
    const timer = window.setTimeout(() => {
      if (count <= 1) setPhase("point");
      else setCount(count - 1);
    }, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, count, paused]);

  function start() {
    if (reducedMotion) {
      setPhase("point");
      return;
    }
    setCount(COUNTDOWN_FROM);
    setPhase("counting");
  }

  return (
    <article className={`game-card game-card--${card.packId} pointing-game`} data-phase={phase}>
      <span className="game-card__crown" aria-hidden="true">♔</span>
      <div className="game-card__pack"><Icon name="point" />指人游戏</div>
      {participantNames.length > 0 && <p className="game-card__players">{participantNames.length} 人同时指</p>}
      <h1>{card.content}</h1>
      {card.instruction && <p className="game-card__instruction">{card.instruction}</p>}
      <div className="pointing-game__stage">
        {phase === "ready" && <p className="pointing-game__ready">准备好了吗？</p>}
        {phase === "counting" && <p className="pointing-game__count" role="status" aria-label={`倒数 ${count} 秒`}>{count}</p>}
        {phase === "point" && <p className="pointing-game__go" role="status" aria-label="一起指">👉 指！</p>}
      </div>
      {phase !== "point" && <div className="pointing-game__controls">{phase === "ready" ? <Button type="button" disabled={paused} onClick={start}>准备好了</Button> : <Button variant="secondary" type="button" disabled={paused} onClick={() => setPhase("point")}><Icon name="skip" />跳过倒数</Button>}</div>}
      {phase === "point" && <p className="pointing-game__hint">不用统计票数，指完就可以继续</p>}
      {phase === "point" && actions && <RoundActions compact disabled={paused} completeLabel="下一题" onComplete={actions.onComplete} onSwap={actions.onSwap} />}
      <span className="game-card__source">{sourceLabel(card.source)}</span>
    </article>
  );
}
