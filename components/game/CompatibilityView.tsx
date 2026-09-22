"use client";

import { CompatibilityPairPicker } from "@/components/game/CompatibilityPairPicker";
import { RoundActions } from "@/components/game/RoundActions";
import type { PackViewProps } from "@/components/game/PackViewHost";
import { Icon } from "@/components/ui/Icon";
import type { GameCard } from "@/lib/domain/schemas";

const HINT = "3 · 2 · 1 同时回答";

const sourceLabel = (source: GameCard["source"]) => (source === "ai" ? "AI 生成" : source === "custom" ? "自定义" : "本地题库");

/**
 * 默契测试视图（Plan 5.4 / US5 / T146）：pair + 题目 + 3/2/1 + 一样/不一样 + score/rounds。
 * 单机同桌：两人同时口头回答，主持人点“一样/不一样”，不做任何秘密输入（Constitution 2 / FR-019）。
 * 分数只在“一样”时 +1（reducer 见 compatibility-test.ts），这里只负责把判定发出去。
 */
export function CompatibilityView({ card, actions, compatibility, paused = false }: PackViewProps) {
  const ctx = compatibility;
  const state = ctx?.pair?.state;
  return (
    <article className="game-card game-card--compatibility-test compatibility-game" data-card-id={card.id}>
      <span className="game-card__crown" aria-hidden="true">♔</span>
      <div className="game-card__pack"><Icon name="heart" />默契测试</div>

      {state && ctx?.pair ? (
        <p className="compat-game__pair">
          <span role="status">{ctx.pair.names.a} × {ctx.pair.names.b}</span>
          <span className="compat-game__score">默契 {state.score}/{state.rounds}</span>
        </p>
      ) : (
        <p className="compat-game__pair compat-game__pair--empty">先选两位玩家开始</p>
      )}

      <h1>{card.content}</h1>
      {card.instruction && <p className="game-card__instruction">{card.instruction}</p>}

      <p className="compat-game__countdown" role="status">
        <span className="compat-game__hint">{HINT}</span>
        <span className="compat-game__count" aria-hidden="true">3 · 2 · 1</span>
      </p>

      <CompatibilityPairPicker players={ctx?.players ?? []} value={state} onChange={(playerId) => ctx?.onChangePair(playerId)} />

      <div className="compat-game__judge">
        <button className="compat-game__same" type="button" disabled={!state || paused} onClick={() => ctx?.onAnswer("same")}>一样 ❤️</button>
        <button className="compat-game__different" type="button" disabled={!state || paused} onClick={() => ctx?.onAnswer("different")}>不一样 😂</button>
      </div>
      <p className="compat-game__note">分数只是当晚的娱乐，不代表任何严肃评价</p>

      {actions && <RoundActions compact disabled={paused} completeLabel="下一题" onComplete={actions.onComplete} onSwap={actions.onSwap} />}
      <span className="game-card__source">{sourceLabel(card.source)}</span>
    </article>
  );
}
