import { RoundActions } from "@/components/game/RoundActions";
import type { PackViewProps } from "@/components/game/PackViewHost";
import { Icon } from "@/components/ui/Icon";
import type { GameCard } from "@/lib/domain/schemas";

/** AI 生成与本地 seed 都把两个选项合成为 “A VS B” 题面（见 lib/ai/normalize.ts），renderer 只认 content。 */
const SEPARATOR = " VS ";
const HINT = "3 · 2 · 1 一起说";
/** 短倒计时步长；三步依次淡入淡出后停在静态提示，纯 CSS 播放，reduced-motion 由全局媒体查询兜底。 */
const COUNT_STEPS = [3, 2, 1];

export function splitWouldYouRather(content: string): [string, string] {
  const index = content.indexOf(SEPARATOR);
  if (index < 0) return [content, ""];
  return [content.slice(0, index), content.slice(index + SEPARATOR.length)];
}

const sourceLabel = (source: GameCard["source"]) => (source === "ai" ? "AI 生成" : source === "custom" ? "自定义" : "本地题库");

/**
 * 二选一视图（Plan 8.1）：只负责 A / VS / B 题面、可选短倒计时提示、一主一辅两个动作。
 * 不采集任何逐人输入（Constitution 2 / FR-019），动作语义交给共享引擎：下一题=completed，换一个=swapped。
 */
export function WouldYouRatherView({ card, actions, paused = false }: PackViewProps) {
  const [optionA, optionB] = splitWouldYouRather(card.content);

  return (
    <article className="game-card game-card--would-you-rather would-you-rather" data-card-id={card.id}>
      <span className="game-card__crown" aria-hidden="true">♔</span>
      <div className="game-card__pack"><Icon name="spark" />二选一</div>
      <h1 className="would-you-rather__prompt">必须选一个</h1>
      <div className="would-you-rather__options">
        <p className="would-you-rather__option would-you-rather__option--a"><span aria-hidden="true">A</span>{optionA}</p>
        <span className="would-you-rather__vs">VS</span>
        <p className="would-you-rather__option would-you-rather__option--b"><span aria-hidden="true">B</span>{optionB}</p>
      </div>
      <p className="would-you-rather__countdown" role="status">
        <span className="would-you-rather__hint">{HINT}</span>
        {COUNT_STEPS.map((step) => <span className="would-you-rather__count" aria-hidden="true" key={step}>{step}</span>)}
      </p>
      {card.instruction && <p className="game-card__instruction">{card.instruction}</p>}
      {actions && <RoundActions compact disabled={paused} completeLabel="下一题" onComplete={actions.onComplete} onSwap={actions.onSwap} />}
      <span className="game-card__source">{sourceLabel(card.source)}</span>
    </article>
  );
}
