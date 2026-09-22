import { BOUNDARIES } from "@/lib/domain/constants";
import type { GamePackDefinition, SessionConfig } from "@/lib/domain/schemas";
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";

/**
 * 需要专属结构化字段的 AI 玩法（Plan 8.1-8.3）。
 * V1.0 四包不在此表：只要没有新玩法启用，prompt 输出就与旧版逐字一致。
 */
const STRUCTURED_PACK_HINTS: Record<string, string> = {
  "would-you-rather": '二选一（would-you-rather）：用 {"type":"would-you-rather","optionA":"选项 A","optionB":"选项 B"} 出题，两个选项各不超过 120 字，minPlayers 为 2，省略 content。',
  "pointing-game": '指人游戏（pointing-game）：用 {"type":"pointing","prompt":"一句对所有人说的直接指令，不做概率提问"} 出题，不超过 200 字，minPlayers 为 3，省略 content。',
  "compatibility-test": '默契测试（compatibility-test）：用 {"type":"compatibility","prompt":"一道两人同时口头回答的题","answerMode":"open|binary|choice"} 出题，answerMode 为 choice 时必须给 "options" 字符串数组，minPlayers 为 2，省略 content。',
};

export function buildDeckPrompt(config: SessionConfig, targetCardCount: number, packs: GamePackDefinition[]): string {
  const activePlayers = config.players.filter((player) => player.active);
  // 动作型入口（“随机玩一个”）自己不出题卡，绝不进 AI 的出题枚举（V1.4 R-047）；即使它在启用集合里也过滤掉。
  const playablePacks = packs.filter((pack) => !isRandomLauncherPackId(pack.id));
  const blockedTags = BOUNDARIES.filter((boundary) => config.boundaries[boundary.key]).map((boundary) => boundary.tag);
  const allowedBoundaryTags = BOUNDARIES.map((boundary) => boundary.tag);
  const lines = [
    "你是 Party Night 的安全聚会主持人。只输出一个合法 JSON 对象，不要 Markdown。",
    "严禁输出思考过程、解释、前言或任何 JSON 之外的文字；第一个字符必须是 {，最后一个字符必须是 }。",
    `生成 ${targetCardCount} 张中文游戏卡，供整局离线使用。`,
    `玩家：${activePlayers.map((player) => player.displayName).join("、")}；关系：${config.relationship}；氛围：${config.vibes.join("、")}；最高强度：${config.intensity}。`,
    `可用玩法：${playablePacks.map((pack) => `${pack.id}(${pack.supportedCardTypes.join("/")})`).join("；")}。`,
    `已开启的结构化雷区：${blockedTags.join("、") || "无"}；生成内容必须避开这些主题。`,
    `自定义雷区：${config.boundaries.customText || "无"}；只需避开，不得把自定义文字写入 boundaryTags。`,
    `boundaryTags 只能包含这些英文枚举值：${allowedBoundaryTags.join("、")}；不涉及则必须输出空数组，禁止输出中文说明或其他值。`,
    "禁止强迫饮酒、危险行为、违法行为、未经同意身体接触、羞辱或泄露隐私。任何任务都允许跳过。",
    "禁止涉及未成年人的任何露骨性内容；参与者年龄未知时不得生成露骨性任务或问题，不得把醉酒状态当作同意。",
    `JSON schema：{"cards":[{"id":"unique-id","packId":"${playablePacks.map((pack) => pack.id).join("|")}","type":"string","content":"string","instruction":"string","intensity":1,"tags":[],"boundaryTags":[],"minPlayers":2,"participantMode":"none|single|pair|all","source":"ai"}],"meta":{"generatedCount":0,"provider":"configured-provider"}}`,
  ];
  const hints = playablePacks.map((pack) => STRUCTURED_PACK_HINTS[pack.id]).filter((hint): hint is string => Boolean(hint));
  if (hints.length) {
    lines.push(
      "以下新玩法卡不要 content 字段，公共字段（id、packId、type、intensity、tags、boundaryTags、minPlayers、participantMode）照常给全：",
      ...hints,
      "V1.0 玩法仍用 content + 可选 instruction，不要带上述新字段。",
    );
  }
  return lines.join("\n");
}
