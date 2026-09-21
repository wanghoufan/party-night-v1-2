import { Icon } from "@/components/ui/Icon";
import type { GameCard } from "@/lib/domain/schemas";

const names: Record<string, string> = { "truth-dare": "真心话大冒险", "most-likely": "谁最可能", "never-have": "我从来没有", "ai-improv": "AI 即兴任务" };
const icons: Record<string, "heart" | "users" | "glass" | "spark"> = { "truth-dare": "heart", "most-likely": "users", "never-have": "glass", "ai-improv": "spark" };

export function GameCardView({ card, participantNames }: { card: GameCard; participantNames: string[] }) {
  return <article className={`game-card game-card--${card.packId}`}><div className="game-card__crown">♔</div><div className="game-card__pack"><Icon name={icons[card.packId] ?? "spark"} />{names[card.packId] ?? card.packId}</div>{participantNames.length > 0 && <p className="game-card__players">{participantNames.join(" × ")}</p>}<h1>{card.content}</h1>{card.instruction && <p className="game-card__instruction">{card.instruction}</p>}<span className="game-card__source">{card.source === "ai" ? "AI 生成" : card.source === "custom" ? "自定义" : "本地题库"}</span></article>;
}
