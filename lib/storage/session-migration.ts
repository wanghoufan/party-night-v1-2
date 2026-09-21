import { SESSION_SCHEMA_VERSION, gameSessionSchema, sessionConfigSchema, type GameSession, type SessionConfig } from "@/lib/domain/schemas";
import { resolvePackCapability } from "@/lib/domain/pack-capability";
import { COMPATIBILITY_PACK_ID, COMPATIBILITY_STATE_KEY } from "@/lib/game-packs/compatibility-test";
import { getGamePack } from "@/lib/game-packs/registry";
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";
import { SPIN_BOTTLE_PACK_ID, SPIN_BOTTLE_STATE_KEY } from "@/lib/game-packs/spin-bottle";

export const CURRENT_SESSION_SCHEMA_VERSION = SESSION_SCHEMA_VERSION;

/** 坏记录被隔离的原因标记：读取路径与启动 reconcile 只写这一种，便于诊断与后续数据修复。 */
export const QUARANTINE_REASON = "deserialize-failed";

/** 迁移前的最后一版（V1.0 / V1.1 落库形态）。 */
const MIGRATABLE_SESSION_SCHEMA_VERSIONS = [1];

/**
 * GAP-02：旧口径把 pack-local state 平铺在 currentPackState 里（按 state key），新口径按 packId 分键。
 * 表里只登记两者不同的键；转瓶子的旧键恰好等于玩法 id，天然无需改键。
 */
const LEGACY_PACK_STATE_KEYS: Record<string, string> = {
  [COMPATIBILITY_STATE_KEY]: COMPATIBILITY_PACK_ID,
  [SPIN_BOTTLE_STATE_KEY]: SPIN_BOTTLE_PACK_ID,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取时在内存里补齐 pack-local state：旧平铺键归到对应玩法 id，非 record 的碎片丢掉。
 * 幂等——已是新口径的记录原样返回，不重写、不猜内容（GAP-02）。
 */
function backfillPackState(state: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(state)) return {};
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!isRecord(value)) continue;
    normalized[LEGACY_PACK_STATE_KEYS[key] ?? key] = value;
  }
  return normalized;
}

function withBackfilledPackState(session: GameSession): GameSession {
  return { ...session, currentPackState: backfillPackState(session.currentPackState) };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 旧局丢弃退役启动器卡后，currentPackId 的回落锚点：真心话大冒险始终是内置首选（R-049）。 */
const TRUTH_DARE_PACK_ID = "truth-dare";

/**
 * R-049：旧 Session 的 currentPackId 指向已退役的启动器（`ai-improv`）时按固定顺序回落——
 * 先选「已启用且当前人数可玩」的真心话大冒险，否则取规范启用序列里第一个同样可玩的玩法。
 * 规范序列＝Session 快照自身的顺序（内置 registry 固定顺序在前、自定义 createdAt/id 升序在后）。
 * 快照里已删除/从未注册的包判为不可用；一个合法候选都没有时返回 undefined——宁可安全回首页，也不激活不可玩的局。
 */
export function fallbackPackIdForRetiredLauncher(enabledPackIds: string[], playerCount: number): string | undefined {
  const playable = enabledPackIds.filter((id) => {
    if (isRandomLauncherPackId(id)) return false;
    const definition = getGamePack(id);
    return definition ? resolvePackCapability(definition).minPlayers <= playerCount : false;
  });
  if (playable.includes(TRUTH_DARE_PACK_ID)) return TRUTH_DARE_PACK_ID;
  return playable[0];
}

const activePlayerCount = (config: SessionConfig): number => config.players.filter((player) => player.active).length;

/**
 * R-048 / R-049：退役玩法（`ai-improv`）只清理、不改写——
 * - `deckSnapshot` 里的旧卡**直接丢弃**，绝不转成真心话/其他包，也绝不进任何回落包；
 * - 指向这些卡的 `usedCardIds` 与未完成 `currentRound` 一并清掉；
 * - 已完成 `rounds` 保留原始 `packId` 作为历史事实，不改名、不重入出题池；
 * - `currentPackId` 命中退役 id 时按 `fallbackPackIdForRetiredLauncher` 回落。
 * 幂等：没有旧卡且 currentPackId 已不是退役 id 时原样返回，二次迁移结果完全相同。
 * 回落不出任何合法候选（快照只剩退役包/已删除包/人数不足）时返回 undefined，由读取路径按坏记录安全隔离。
 */
function stripRetiredLauncher(session: GameSession): GameSession | undefined {
  const retiredCardIds = new Set(session.deckSnapshot.filter((card) => isRandomLauncherPackId(card.packId)).map((card) => card.id));
  const needsFallback = isRandomLauncherPackId(session.currentPackId);
  if (!retiredCardIds.size && !needsFallback) return session;
  const fallbackPackId = needsFallback ? fallbackPackIdForRetiredLauncher(session.config.enabledPackIds, activePlayerCount(session.config)) : session.currentPackId;
  if (!fallbackPackId) return undefined;
  const dropsOpenRound = Boolean(session.currentRound && (retiredCardIds.has(session.currentRound.cardId) || isRandomLauncherPackId(session.currentRound.packId)));
  return {
    ...session,
    deckSnapshot: session.deckSnapshot.filter((card) => !retiredCardIds.has(card.id)),
    usedCardIds: session.usedCardIds.filter((id) => !retiredCardIds.has(id)),
    currentRound: dropsOpenRound ? undefined : session.currentRound,
    currentPackId: fallbackPackId,
  };
}

function packIdFrom(entry: unknown): string | undefined {
  return isRecord(entry) ? nonEmptyString(entry.packId) : undefined;
}

/** 旧 Session 缺 currentPackId 时：最近一轮 → 牌堆首张 → 第一个已启用玩法；推导不出则不猜。 */
export function deriveCurrentPackId(record: Record<string, unknown>, enabledPackIds: string[] = []): string | undefined {
  const rounds = Array.isArray(record.rounds) ? record.rounds : [];
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const packId = packIdFrom(rounds[index]);
    if (packId) return packId;
  }
  const deck = Array.isArray(record.deckSnapshot) ? record.deckSnapshot : [];
  for (const entry of deck) {
    const packId = packIdFrom(entry);
    if (packId) return packId;
  }
  return enabledPackIds.map(nonEmptyString).find(Boolean);
}

function upgradeToCurrent(record: Record<string, unknown>): Record<string, unknown> {
  const config = sessionConfigSchema.safeParse(record.config);
  const currentPackId = nonEmptyString(record.currentPackId)
    ?? deriveCurrentPackId(record, config.success ? config.data.enabledPackIds : []);
  return {
    ...record,
    schemaVersion: CURRENT_SESSION_SCHEMA_VERSION,
    ...(currentPackId ? { currentPackId } : {}),
    currentPackState: isRecord(record.currentPackState) ? record.currentPackState : {},
    recentRejectedFingerprints: Array.isArray(record.recentRejectedFingerprints) ? record.recentRejectedFingerprints : [],
  };
}

/**
 * 幂等、非破坏地把落库记录读成当前 schema 的 GameSession。
 * 已是当前版本 → 直接解析返回；坏记录/未知版本 → undefined（由调用方隔离，不猜也不想当然清库）。
 */
export function migrateSessionRecord(raw: unknown): GameSession | undefined {
  if (!isRecord(raw)) return undefined;

  const current = gameSessionSchema.safeParse(raw);
  if (current.success) return stripRetiredLauncher(withBackfilledPackState(current.data));

  const version = raw.schemaVersion;
  if (version !== undefined && !MIGRATABLE_SESSION_SCHEMA_VERSIONS.includes(version as number)) return undefined;

  const migrated = gameSessionSchema.safeParse(upgradeToCurrent(raw));
  return migrated.success ? stripRetiredLauncher(withBackfilledPackState(migrated.data)) : undefined;
}
