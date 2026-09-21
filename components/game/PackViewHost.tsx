import type { ComponentType } from "react";
import { GameCardView } from "@/components/game/GameCardView";
import type { GameCard } from "@/lib/domain/schemas";
import { resolvePackRendererById } from "@/lib/game-packs/registry";

export interface PackViewProps {
  card: GameCard;
  participantNames: string[];
}

/**
 * renderer → 玩法视图的唯一映射表：新玩法（二选一/指人/默契/转瓶子）在各自 Phase 登记自己的 view，
 * 不新建独立 Session 页面。未登记的 renderer 回落到通用题卡视图。
 */
const RENDERER_VIEWS: Partial<Record<string, ComponentType<PackViewProps>>> = {
  card: GameCardView,
};

export function PackViewHost({ packId, card, participantNames }: { packId: string; card: GameCard; participantNames: string[] }) {
  const View = RENDERER_VIEWS[resolvePackRendererById(packId)] ?? GameCardView;
  return <View card={card} participantNames={participantNames} />;
}
