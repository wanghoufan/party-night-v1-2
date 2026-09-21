import type { ComponentType } from "react";
import { CompatibilityView } from "@/components/game/CompatibilityView";
import { GameCardView } from "@/components/game/GameCardView";
import { PointingGameView } from "@/components/game/PointingGameView";
import { WouldYouRatherView } from "@/components/game/WouldYouRatherView";
import type { GameCard, PackRenderer, Player } from "@/lib/domain/schemas";
import type { CompatibilityState } from "@/lib/game-packs/compatibility-test";
import { resolvePackRendererById } from "@/lib/game-packs/registry";

/** 共享引擎动作：玩法视图只发起意图，completed/swapped/skipped 的语义仍由 lib/engine 决定。 */
export interface RoundActionHandlers {
  onComplete: () => void;
  onSwap: () => void;
  onSkip: () => void;
}

/** 默契测试的配对上下文：主局把 Session 玩家与 pack-local state 传进来，视图只负责显示与回调。 */
export interface CompatibilityHandlers {
  players: Player[];
  pair?: { playerAId: string; playerBId: string; names: { a: string; b: string }; state: CompatibilityState };
  onChangePair: (playerId: string) => void;
  onAnswer: (answer: "same" | "different") => void;
}

export interface PackViewProps {
  card: GameCard;
  participantNames: string[];
  /** 自带动作条的玩法才会拿到；默认题卡视图由主局渲染共享动作条。 */
  actions?: RoundActionHandlers;
  /** 只有默契测试等需要玩家参与方上下文的玩法会拿到。 */
  compatibility?: CompatibilityHandlers;
}

/**
 * renderer → 玩法视图的唯一映射表：新玩法（二选一/指人/默契/转瓶子）在各自 Phase 登记自己的 view，
 * 不新建独立 Session 页面。未登记的 renderer 回落到通用题卡视图。
 */
const RENDERER_VIEWS: Partial<Record<PackRenderer, ComponentType<PackViewProps>>> = {
  card: GameCardView,
  "binary-choice": WouldYouRatherView,
  pointing: PointingGameView,
  compatibility: CompatibilityView,
};

/** 自带动作条的 renderer（一屏一主一辅）；主局据此不再渲染共享动作条，避免出现两套主按钮。 */
const RENDERERS_WITH_OWN_ACTIONS: PackRenderer[] = ["binary-choice", "pointing", "compatibility"];

export function packViewOwnsActions(packId: string): boolean {
  return RENDERERS_WITH_OWN_ACTIONS.includes(resolvePackRendererById(packId));
}

export function PackViewHost({ packId, card, participantNames, actions, compatibility }: { packId: string; card: GameCard; participantNames: string[] } & Pick<PackViewProps, "actions" | "compatibility">) {
  const View = RENDERER_VIEWS[resolvePackRendererById(packId)] ?? GameCardView;
  return <View card={card} participantNames={participantNames} actions={actions} compatibility={compatibility} />;
}
