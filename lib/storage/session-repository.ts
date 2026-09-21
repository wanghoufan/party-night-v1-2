import { gameSessionSchema, type GameSession } from "@/lib/domain/schemas";
import { classifySchemaVersion } from "./session-maintenance";
import { migrateSessionRecord, QUARANTINE_REASON } from "./session-migration";
import { getDb, type QuarantinedSessionRecord } from "./db";

export { QUARANTINE_REASON };

/**
 * 隔离坏记录（T190 / Plan 12.6）：先留原始副本，再把坏记录从 sessions 摘掉。
 * 两步都容错——隔离位写不进去（配额、隐私模式）也不能让读盘抛异常，否则首页会白屏。
 */
async function isolateUnreadableSession(key: string, raw: unknown): Promise<void> {
  const db = await getDb();
  const record: QuarantinedSessionRecord = { id: String(key), reason: QUARANTINE_REASON, quarantinedAt: new Date().toISOString(), raw };
  try {
    await db.put("sessionQuarantine", record);
  } catch {
    // 保留原始内容失败时仍然摘掉坏记录，避免每次启动都重复失败
  }
  // 落库键按 schema 是 string；旧数据/外部写入可能带别的合法 IDB 键（如数字），这里只按调用方给的键删
  await db.delete("sessions", key);
}

/**
 * 版本错位 guard（T201）：更高版本 App 写的数据（schemaVersion > 当前 bundle）只读保留，
 * 既不当作坏记录隔离，也不尝试按旧 schema 解释——避免旧 bundle 把新数据删掉。
 */
function isNewerSchema(raw: unknown): boolean {
  return classifySchemaVersion((raw as { schemaVersion?: unknown } | undefined)?.schemaVersion) === "newer";
}

export const sessionRepository = {
  async save(session: GameSession): Promise<void> {
    const db = await getDb();
    await db.put("sessions", gameSessionSchema.parse(session));
  },
  async get(id: string): Promise<GameSession | undefined> {
    const db = await getDb();
    const raw = await db.get("sessions", id);
    if (isNewerSchema(raw)) return undefined;
    const migrated = migrateSessionRecord(raw);
    if (migrated) return migrated;
    if (raw !== undefined) await isolateUnreadableSession(id, raw);
    return undefined;
  },
  async getLatestUnfinished(): Promise<GameSession | undefined> {
    const db = await getDb();
    const [keys, records] = await Promise.all([db.getAllKeys("sessions"), db.getAll("sessions")]);
    const valid: GameSession[] = [];
    for (const [index, record] of records.entries()) {
      if (isNewerSchema(record)) continue;
      const migrated = migrateSessionRecord(record);
      if (migrated) valid.push(migrated);
      else await isolateUnreadableSession(keys[index]!, record);
    }
    return valid.filter((session) => session.status === "active" || session.status === "paused" || session.status === "generating").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  },
  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("sessions", id);
  },
};

export interface SessionAutosave {
  /** 落库一次重要动作；返回的 Promise 只代表这一次写入。 */
  save(session: GameSession): Promise<void>;
  /** 等所有在途写入落库（刷新/离开页面前用）。 */
  flush(): Promise<void>;
}

/**
 * 重要动作的串行 autosave（T187 / US9）：切玩法、完成/换一个/跳过、默契分数、转瓶子落点都从这里落库。
 * 写入按调用顺序排队，避免「后发起的动作先落盘」把刷新读到的状态退回上一轮；
 * 单次写入失败不会卡住后续动作（但该次失败会如实 reject 给调用方）。
 */
export function createSessionAutosave(persist: (session: GameSession) => Promise<void> = (session) => sessionRepository.save(session)): SessionAutosave {
  let chain: Promise<void> = Promise.resolve();
  return {
    save(session: GameSession): Promise<void> {
      const write = chain.then(() => persist(session));
      chain = write.catch(() => undefined);
      return write;
    },
    flush(): Promise<void> {
      return chain;
    },
  };
}
