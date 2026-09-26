/**
 * V1.3 Frozen 内容真源（schema 2.3）的类型、枚举与纯校验。
 * 本模块不含 Node 内置依赖，可同时被 scripts/build-v2-ssot.ts（Node 构建门禁）
 * 与业务窗口/测试安全引用。
 *
 * 真源约束（PRODUCT_PLAN_V2.0 R5）：
 * - 主线 member：`Party Night V1.3 冻结基线/10-卡片元数据.json`，schema 2.3，cards 350；
 * - 扩圈 member：`Party Night V1.3 冻结基线/10b-扩圈元数据.json`，schema 2.3，cards 40；
 * - 两条 SHA256 以 R5 节固定值为唯一门禁，不符即 fail closed（哈希由构建门禁执行）；
 * - 自动内容等价 ID 映射 = NONE，同类序号只是审计坐标，不能当作迁移 map。
 */

export const V2_SSOT_ARCHIVE_REL_PATH = "docs/content/v6/2026-09-24 - MAC - ChatGPT - Party Night V1.3冻结基线-备份 - V1.1.zip";

export const V2_SSOT_MAINLINE_MEMBER = "Party Night V1.3 冻结基线/10-卡片元数据.json";
export const V2_SSOT_MAINLINE_SHA256 = "6b6c43f870fe22a86c98423db483cc99734090b1f70c48c31dc3fc6b47c75f33";

export const V2_SSOT_EXPANSION_MEMBER = "Party Night V1.3 冻结基线/10b-扩圈元数据.json";
export const V2_SSOT_EXPANSION_SHA256 = "01ff77acd8eb2f53166a9da84aa403c6a49902e3a6e7a0104f4ea83d9f4c5b8d";

export const V2_SSOT_SCHEMA_VERSION = "2.3" as const;
export const V2_SSOT_MAINLINE_CARD_COUNT = 350;
export const V2_SSOT_EXPANSION_CARD_COUNT = 40;
export const V2_SSOT_ARCHIVE_SCHEMA = "party-night/v2-content-ssot/v1" as const;

export const V2_GAME_TYPES = ["truth", "dare", "most_likely", "never_have_i", "either_or", "pointing", "chemistry"] as const;
export const V2_RELATION_STAGES = ["notice", "know", "signal", "flirt", "continue"] as const;
export const V2_TARGET_MODES = ["all-players", "choose-opposite-sex", "system-opposite-sex", "match-pair", "signal-pair", "system-pair", "pair-vote", "private-choice"] as const;
export const V2_RESPONSE_MODES = ["public", "aggregate-only", "private-individual", "private-mutual-result"] as const;
export const V2_INTERACTION_TYPES = ["preference", "expression", "action", "vote", "disclosure", "pointing", "prediction"] as const;
export const V2_CONSENT_MODES = ["skip-anytime", "mutual-current-consent", "private-mutual-only"] as const;
export const V2_MAINLINE_FALLBACK_POLICIES = ["skip-card", "no-action-continue-chat"] as const;
export const V2_BOUNDARY_TAGS = ["relationship-sensitive", "proximity", "physical-contact", "photo-optional", "external-participant"] as const;
export const V2_SIGNAL_EFFECTS = ["personal", "compatibility", "shared", "crowd", "one-off-mutual", "mutual-match"] as const;
export const V2_POST_ACTIONS = ["none", "show-mutual-result-only", "execute-intersection-only", "offer-one-paired-card-if-mutual", "optional-target-select-then-match", "show-intersection-only", "create-match-if-mutual"] as const;
export const V2_EXPANSION_FALLBACK_POLICY = "switch-to-table-version" as const;

export const V2_RUNTIME_RULES_KEYS = ["coverageGate", "drawBands", "chemistryCompatibility", "heatProgression", "targetedScheduling", "mutualCheckScheduler", "intensity5Unlock", "pairRouting", "signalFilters", "mostLikely50OneOff"] as const;

export interface V13MainlineCard {
  schemaVersion: string;
  cardId: string;
  gameType: (typeof V2_GAME_TYPES)[number];
  number: number;
  text: string;
  intensity: number;
  heatMin: number;
  heatMax: number;
  relationStage: (typeof V2_RELATION_STAGES)[number];
  targetMode: (typeof V2_TARGET_MODES)[number];
  responseMode: (typeof V2_RESPONSE_MODES)[number];
  interactionType: (typeof V2_INTERACTION_TYPES)[number];
  consentMode: (typeof V2_CONSENT_MODES)[number];
  matchRequired: boolean;
  boundaryTags: (typeof V2_BOUNDARY_TAGS)[number][];
  fallbackPolicy: (typeof V2_MAINLINE_FALLBACK_POLICIES)[number];
  signalEffects: (typeof V2_SIGNAL_EFFECTS)[number][];
  postAction: (typeof V2_POST_ACTIONS)[number];
}

export interface V13ExpansionCard {
  schemaVersion: string;
  cardId: string;
  number: number;
  text: string;
  minIntensity: number;
  responseMode: (typeof V2_RESPONSE_MODES)[number];
  consentMode: (typeof V2_CONSENT_MODES)[number];
  signalEffects: (typeof V2_SIGNAL_EFFECTS)[number][];
  fallbackPolicy: typeof V2_EXPANSION_FALLBACK_POLICY;
  boundaryTags: (typeof V2_BOUNDARY_TAGS)[number][];
  pairScoreEligible: boolean;
  matchEligible: boolean;
  sourceCardId?: string;
}

/** V1.3 主线 runtimeRules 的强类型视图。B1 只校验存在与结构合法；R3 契约属后续受控快照批次。 */
export interface V13RuntimeConfig {
  coverageGate: Record<string, unknown>;
  drawBands: Record<string, unknown>;
  chemistryCompatibility: Record<string, unknown>;
  heatProgression: Record<string, unknown>;
  targetedScheduling: Record<string, unknown>;
  mutualCheckScheduler: Record<string, unknown>;
  intensity5Unlock: Record<string, unknown>;
  pairRouting: Record<string, unknown>;
  signalFilters: Record<string, unknown>;
  mostLikely50OneOff: Record<string, unknown>;
}

export interface V2MemberProvenance {
  memberPath: string;
  sha256: string;
  schemaVersion: string;
  cardCount: number;
}

export interface V2SnapshotProvenance {
  generator: string;
  archivePath: string;
  migrationIdPolicy: "NONE";
  mainline: V2MemberProvenance;
  expansion: V2MemberProvenance;
}

export interface V2ContentSnapshot {
  $schema: typeof V2_SSOT_ARCHIVE_SCHEMA;
  provenance: V2SnapshotProvenance;
  runtimeRules: V13RuntimeConfig;
  mainlineCards: readonly V13MainlineCard[];
  expansionCards: readonly V13ExpansionCard[];
}

export interface V2Envelope {
  mainlineSchemaVersion: unknown;
  mainlineCards: unknown;
  expansionSchemaVersion: unknown;
  expansionCards: unknown;
  runtimeRules: unknown;
}

export type V2Validation = { ok: true; stats: { mainline: number; expansion: number; uniqueCardIds: number } } | { ok: false; issues: string[] };