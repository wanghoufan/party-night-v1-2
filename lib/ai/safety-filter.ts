import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile, GameCard, Intensity } from "@/lib/domain/schemas";
import { dedupeCards, normalizeText } from "./normalize";

/**
 * 安全硬规则（FR-046 / T202）：与尺度、雷区无关，永远拦截。
 * 高尺度只代表在允许边界内更刺激，不放松以下五类禁令。
 */
const HARD_BLOCK_PATTERNS = [
  // 强迫饮酒 / 罚酒
  /强迫[^，。]{0,8}(喝|灌|饮酒)/,
  /(罚酒|强灌|灌酒)/,
  // 危险行为（含酒后驾驶两个语序）
  /(驾车|开车|驾驶).{0,8}(喝酒|饮酒|喝酒后)/,
  /(喝酒|饮酒|喝完|喝多|醉酒).{0,8}(开车|驾车|驾驶)/,
  /(天台|楼顶|阳台|栏杆|马路|车道|高速|飙车|极限挑战|危险动作|危险挑战|生吞|生吃|跳下|跳楼|玩火|点火|自残|自杀)/,
  // 违法危险
  /(违法|偷窃|盗窃|诈骗|吸毒|贩毒|赌博|酒驾|醉驾)/,
  // 非自愿身体接触
  /(未经[^，。！？；]{0,4}同意|不许拒绝|不能拒绝|不允许拒绝|不得拒绝)/,
  /(强迫|强制|逼着|强行|逼迫)/,
  // 露骨性内容（参与者年龄未知 → 一律不生成）
  /(露骨|性幻想|性经历|性行为|做爱|性爱|脱衣|裸体|裸照|口交|情趣|开房)/,
];

/** 需要“两个词同时出现”才算违规的组合规则：针对未成年人的亲密内容。 */
const PAIRWISE_BLOCK_RULES: Array<[RegExp, RegExp]> = [
  [/(未成年|小学生|中学生|初中生|高中生|儿童|幼童)/, /(性|亲密|露骨|脱|裸|亲吻|接吻|拥抱|身体)/],
];

export interface SafetyContext {
  boundaries: BoundaryProfile;
  intensity: Intensity;
  playerCount: number;
}

/** 文本是否触发任一安全硬规则（供 filter 与测试复用）。 */
export function isHardBlocked(text: string): boolean {
  const normalized = normalizeText(text);
  if (HARD_BLOCK_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  return PAIRWISE_BLOCK_RULES.some(([first, second]) => first.test(normalized) && second.test(normalized));
}

export function filterCards(cards: GameCard[], context: SafetyContext): GameCard[] {
  const blockedTags = new Set(
    BOUNDARIES.filter(({ key }) => context.boundaries[key]).map(({ tag }) => tag),
  );
  const customTerms = context.boundaries.customText
    .split(/[，,、\n]/)
    .map(normalizeText)
    .filter((term) => term.length >= 2);

  return dedupeCards(cards.filter((card) => {
    const text = normalizeText(`${card.content} ${card.instruction ?? ""}`);
    if (card.intensity > context.intensity || card.minPlayers > context.playerCount) return false;
    if (card.maxPlayers && card.maxPlayers < context.playerCount) return false;
    if (card.boundaryTags.some((tag) => blockedTags.has(tag))) return false;
    if (isHardBlocked(text)) return false;
    return !customTerms.some((term) => text.includes(term));
  }));
}
