import {
  V2_BOUNDARY_TAGS,
  V2_CONSENT_MODES,
  V2_EXPANSION_FALLBACK_POLICY,
  V2_SSOT_EXPANSION_CARD_COUNT as V2_EXPANSION_CARD_COUNT,
  V2_GAME_TYPES,
  V2_INTERACTION_TYPES,
  V2_SSOT_MAINLINE_CARD_COUNT as V2_MAINLINE_CARD_COUNT,
  V2_MAINLINE_FALLBACK_POLICIES,
  V2_POST_ACTIONS,
  V2_RELATION_STAGES,
  V2_RESPONSE_MODES,
  V2_RUNTIME_RULES_KEYS,
  V2_SIGNAL_EFFECTS,
  V2_SSOT_SCHEMA_VERSION,
  V2_TARGET_MODES,
  type V2Envelope,
  type V2Validation,
} from "./v2-types";

const intRange = new Set([1, 2, 3, 4, 5]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function assertStrEnum(issues: string[], label: string, value: unknown, allowed: readonly string[]): void {
  const raw = value as string;
  if (typeof raw !== "string" || !allowed.includes(raw)) issues.push(`${label} 非法枚举值：${String(value)}`);
}

function assertTagArrays(issues: string[], cardLabel: string, value: unknown, allowed: readonly string[]): void {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string" || !allowed.includes(tag))) {
    issues.push(`${cardLabel} 含非法枚举集合`);
  }
}

/**
 * 纯校验真源 envelope（数量 / 唯一 cardId / 枚举 / runtimeRules），不查哈希、不碰文件。
 * 哈希门禁由 scripts/build-v2-ssot.ts 负责（fail closed）。
 */
export function validateV13Envelope(env: V2Envelope): V2Validation {
  const issues: string[] = [];

  if (env.mainlineSchemaVersion !== V2_SSOT_SCHEMA_VERSION) {
    issues.push(`主线 schemaVersion 应为 ${V2_SSOT_SCHEMA_VERSION}，得到 ${String(env.mainlineSchemaVersion)}`);
  }
  if (env.expansionSchemaVersion !== V2_SSOT_SCHEMA_VERSION) {
    issues.push(`扩圈 schemaVersion 应为 ${V2_SSOT_SCHEMA_VERSION}，得到 ${String(env.expansionSchemaVersion)}`);
  }

  if (!Array.isArray(env.mainlineCards)) {
    issues.push("主线 cards 缺失或非数组");
  } else if (env.mainlineCards.length !== V2_MAINLINE_CARD_COUNT) {
    issues.push(`主线 cards 应为 ${V2_MAINLINE_CARD_COUNT}，得到 ${env.mainlineCards.length}`);
  } else {
    for (const [index, card] of env.mainlineCards.entries()) {
      const label = `主线卡[${index}]`;
      if (!isRecord(card)) {
        issues.push(`${label} 非对象`);
        continue;
      }
      for (const field of ["cardId", "gameType", "number", "text", "intensity", "heatMin", "heatMax", "relationStage", "targetMode", "responseMode", "interactionType", "consentMode", "matchRequired", "boundaryTags", "fallbackPolicy", "signalEffects", "postAction"]) {
        if (!(field in card)) issues.push(`${label} 缺字段 ${field}`);
      }
      if (typeof card.cardId !== "string") issues.push(`${label}.cardId 应为字符串`);
      assertStrEnum(issues, `${label}.gameType`, card.gameType, V2_GAME_TYPES);
      assertStrEnum(issues, `${label}.relationStage`, card.relationStage, V2_RELATION_STAGES);
      assertStrEnum(issues, `${label}.targetMode`, card.targetMode, V2_TARGET_MODES);
      assertStrEnum(issues, `${label}.responseMode`, card.responseMode, V2_RESPONSE_MODES);
      assertStrEnum(issues, `${label}.interactionType`, card.interactionType, V2_INTERACTION_TYPES);
      assertStrEnum(issues, `${label}.consentMode`, card.consentMode, V2_CONSENT_MODES);
      assertStrEnum(issues, `${label}.fallbackPolicy`, card.fallbackPolicy, V2_MAINLINE_FALLBACK_POLICIES);
      assertStrEnum(issues, `${label}.postAction`, card.postAction, V2_POST_ACTIONS);
      if (typeof card.number !== "number") issues.push(`${label}.number 应为数字`);
      if (typeof card.intensity !== "number" || !intRange.has(card.intensity)) {
        issues.push(`${label}.intensity 应为 1–5，得到 ${String(card.intensity)}`);
      }
      const heatMin = card.heatMin as number;
      const heatMax = card.heatMax as number;
      if (typeof heatMin !== "number" || typeof heatMax !== "number" || heatMin < 1 || heatMax > 4 || heatMax < heatMin) {
        issues.push(`${label}.heatMin/heatMax 需满足 1≤heatMin≤heatMax≤4`);
      }
      if (typeof card.matchRequired !== "boolean") issues.push(`${label}.matchRequired 应为布尔`);
      assertTagArrays(issues, `${label}.boundaryTags`, card.boundaryTags, V2_BOUNDARY_TAGS);
      assertTagArrays(issues, `${label}.signalEffects`, card.signalEffects, V2_SIGNAL_EFFECTS);
    }
  }

  if (!Array.isArray(env.expansionCards)) {
    issues.push("扩圈 cards 缺失或非数组");
  } else if (env.expansionCards.length !== V2_EXPANSION_CARD_COUNT) {
    issues.push(`扩圈 cards 应为 ${V2_EXPANSION_CARD_COUNT}，得到 ${env.expansionCards.length}`);
  } else {
    for (const [index, card] of env.expansionCards.entries()) {
      const label = `扩圈卡[${index}]`;
      if (!isRecord(card)) {
        issues.push(`${label} 非对象`);
        continue;
      }
      for (const field of ["cardId", "number", "text", "minIntensity", "responseMode", "consentMode", "signalEffects", "fallbackPolicy", "boundaryTags", "pairScoreEligible", "matchEligible"]) {
        if (!(field in card)) issues.push(`${label} 缺字段 ${field}`);
      }
      assertStrEnum(issues, `${label}.responseMode`, card.responseMode, V2_RESPONSE_MODES);
      assertStrEnum(issues, `${label}.consentMode`, card.consentMode, V2_CONSENT_MODES);
      if (card.fallbackPolicy !== V2_EXPANSION_FALLBACK_POLICY) {
        issues.push(`${label}.fallbackPolicy 应为 ${V2_EXPANSION_FALLBACK_POLICY}，得到 ${String(card.fallbackPolicy)}`);
      }
      if (typeof card.minIntensity !== "number") issues.push(`${label}.minIntensity 应为数字`);
      if (typeof card.matchEligible !== "boolean") issues.push(`${label}.matchEligible 应为布尔`);
      if (typeof card.pairScoreEligible !== "boolean") issues.push(`${label}.pairScoreEligible 应为布尔`);
      assertTagArrays(issues, `${label}.boundaryTags`, card.boundaryTags, V2_BOUNDARY_TAGS);
      assertTagArrays(issues, `${label}.signalEffects`, card.signalEffects, V2_SIGNAL_EFFECTS);
    }
  }

  if (!isRecord(env.runtimeRules)) {
    issues.push("主线 runtimeRules 缺失或非对象");
  } else {
    for (const key of V2_RUNTIME_RULES_KEYS) {
      if (!(key in env.runtimeRules)) issues.push(`runtimeRules 缺顶层键 ${key}`);
    }
  }

  const collectIds = (cards: unknown, isMainline: boolean) => {
    const set = new Set<string>();
    if (!Array.isArray(cards)) return set;
    const label = isMainline ? "主线" : "扩圈";
    for (const card of cards) {
      if (!isRecord(card)) continue;
      if (typeof card.cardId !== "string") {
        issues.push(`${label} cardId 应为字符串`);
        continue;
      }
      set.add(card.cardId);
    }
    const expected = isMainline ? V2_MAINLINE_CARD_COUNT : V2_EXPANSION_CARD_COUNT;
    if (set.size < expected) issues.push(`${label} cardId 非唯一`);
    return set;
  };
  const mainlineIds = collectIds(env.mainlineCards, true);
  const expansionIds = collectIds(env.expansionCards, false);
  const allIds = new Set<string>([...mainlineIds, ...expansionIds]);
  if (allIds.size !== mainlineIds.size + expansionIds.size) {
    issues.push("跨主线/扩圈存在重复 cardId，全局唯一性不满足");
  }

  if (issues.length > 0) return { ok: false, issues };
  const mainlineCards = Array.isArray(env.mainlineCards) ? env.mainlineCards : [];
  const expansionCards = Array.isArray(env.expansionCards) ? env.expansionCards : [];
  return { ok: true, stats: { mainline: mainlineCards.length, expansion: expansionCards.length, uniqueCardIds: allIds.size } };
}