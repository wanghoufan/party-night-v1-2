import { getDb, type QuarantinedSessionRecord } from "./db";
import { CURRENT_SESSION_SCHEMA_VERSION, migrateSessionRecord, QUARANTINE_REASON } from "./session-migration";

/**
 * 事务化 migration + 版本错位 guard（T201 / FR-043 / SC-013）：
 * - 启动时在**同一个 IndexedDB 事务**里遍历 sessions：能升级的原地升级，读不出来的进隔离区（保留原始副本）。
 * - 新版本 App 写的记录（schemaVersion 高于当前 bundle）只读不动：不迁移、不隔离、绝不清库。
 * - 任何异常都吞掉并返回 ok:false，绝不让启动路径白屏。
 * 默认修复动作永远不是 destructive clear。
 */

export type SchemaVersionKind = "current" | "migratable" | "newer" | "unknown";

/** 版本错位分类：bundle 与落库数据谁更新。 */
export function classifySchemaVersion(version: unknown): SchemaVersionKind {
  if (typeof version !== "number" || !Number.isInteger(version)) return "unknown";
  if (version === CURRENT_SESSION_SCHEMA_VERSION) return "current";
  if (version < CURRENT_SESSION_SCHEMA_VERSION) return "migratable";
  return "newer";
}

export interface ReconcileResult {
  ok: boolean;
  /** 本次真正就地升级的记录数。 */
  migrated: number;
  /** 本次移入隔离区的坏记录数。 */
  quarantined: number;
  /** 由更高版本 App 写入、只读保留的记录数。 */
  newerSchema: number;
}

/**
 * 一次事务内完成 sessions 的迁移与隔离。已是最新版本的记录不做任何写入（幂等、零无谓写入）。
 */
export async function reconcileSessionStore(): Promise<ReconcileResult> {
  const result: ReconcileResult = { ok: true, migrated: 0, quarantined: 0, newerSchema: 0 };
  try {
    const db = await getDb();
    const transaction = db.transaction(["sessions", "sessionQuarantine"], "readwrite");
    const sessions = transaction.objectStore("sessions");
    const quarantine = transaction.objectStore("sessionQuarantine");
    const [keys, records] = await Promise.all([sessions.getAllKeys(), sessions.getAll()]);
    for (const [index, raw] of records.entries()) {
      const key = keys[index]!;
      const kind = classifySchemaVersion((raw as { schemaVersion?: unknown } | undefined)?.schemaVersion);
      if (kind === "newer") {
        result.newerSchema += 1;
        continue;
      }
      const migrated = migrateSessionRecord(raw);
      if (migrated) {
        if (kind !== "current") {
          // 键就是记录自身的 id（keyPath 建库），不额外传 key：两种实现下语义一致
          await sessions.put(migrated);
          result.migrated += 1;
        }
        continue;
      }
      const record: QuarantinedSessionRecord = {
        id: String(key), reason: QUARANTINE_REASON, quarantinedAt: new Date().toISOString(), raw,
      };
      await quarantine.put(record);
      await sessions.delete(key);
      result.quarantined += 1;
    }
    await transaction.done;
  } catch {
    result.ok = false;
  }
  return result;
}
