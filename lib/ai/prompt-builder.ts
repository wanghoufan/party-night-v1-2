import { BOUNDARIES } from "@/lib/domain/constants";
import type { GamePackDefinition, SessionConfig } from "@/lib/domain/schemas";

export function buildDeckPrompt(config: SessionConfig, targetCardCount: number, packs: GamePackDefinition[]): string {
  const activePlayers = config.players.filter((player) => player.active);
  const blockedTags = BOUNDARIES.filter((boundary) => config.boundaries[boundary.key]).map((boundary) => boundary.tag);
  const allowedBoundaryTags = BOUNDARIES.map((boundary) => boundary.tag);
  return [
    "你是 Party Night 的安全聚会主持人。只输出一个合法 JSON 对象，不要 Markdown。",
    `生成 ${targetCardCount} 张中文游戏卡，供整局离线使用。`,
    `玩家：${activePlayers.map((player) => player.displayName).join("、")}；关系：${config.relationship}；氛围：${config.vibes.join("、")}；最高强度：${config.intensity}。`,
    `可用玩法：${packs.map((pack) => `${pack.id}(${pack.supportedCardTypes.join("/")})`).join("；")}。`,
    `已开启的结构化雷区：${blockedTags.join("、") || "无"}；生成内容必须避开这些主题。`,
    `自定义雷区：${config.boundaries.customText || "无"}；只需避开，不得把自定义文字写入 boundaryTags。`,
    `boundaryTags 只能包含这些英文枚举值：${allowedBoundaryTags.join("、")}；不涉及则必须输出空数组，禁止输出中文说明或其他值。`,
    "禁止强迫饮酒、危险行为、违法行为、未经同意身体接触、羞辱或泄露隐私。任何任务都允许跳过。",
    "JSON schema：{\"cards\":[{\"id\":\"unique-id\",\"packId\":\"truth-dare|most-likely|never-have|ai-improv\",\"type\":\"string\",\"content\":\"string\",\"instruction\":\"string\",\"intensity\":1,\"tags\":[],\"boundaryTags\":[],\"minPlayers\":2,\"participantMode\":\"none|single|pair|all\",\"source\":\"ai\"}],\"meta\":{\"generatedCount\":0,\"provider\":\"configured-provider\"}}",
  ].join("\n");
}
