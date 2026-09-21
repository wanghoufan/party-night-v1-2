import { SESSION_SCHEMA_VERSION, gameSessionSchema, sessionConfigSchema, type GameSession } from "@/lib/domain/schemas";

export const CURRENT_SESSION_SCHEMA_VERSION = SESSION_SCHEMA_VERSION;

/** 坏记录被隔离的原因标记：读取路径与启动 reconcile 只写这一种，便于诊断与后续数据修复。 */
export const QUARANTINE_REASON = "deserialize-failed";

/** 迁移前的最后一版（V1.0 / V1.1 落库形态）。 */
const MIGRATABLE_SESSION_SCHEMA_VERSIONS = [1];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  if (current.success) return current.data;

  const version = raw.schemaVersion;
  if (version !== undefined && !MIGRATABLE_SESSION_SCHEMA_VERSIONS.includes(version as number)) return undefined;

  const migrated = gameSessionSchema.safeParse(upgradeToCurrent(raw));
  return migrated.success ? migrated.data : undefined;
}
