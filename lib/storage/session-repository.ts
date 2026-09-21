import { gameSessionSchema, type GameSession } from "@/lib/domain/schemas";
import { migrateSessionRecord } from "./session-migration";
import { getDb } from "./db";

export const sessionRepository = {
  async save(session: GameSession): Promise<void> {
    const db = await getDb();
    await db.put("sessions", gameSessionSchema.parse(session));
  },
  async get(id: string): Promise<GameSession | undefined> {
    const db = await getDb();
    const raw = await db.get("sessions", id);
    const migrated = migrateSessionRecord(raw);
    if (!migrated && raw) await db.delete("sessions", id);
    return migrated;
  },
  async getLatestUnfinished(): Promise<GameSession | undefined> {
    const db = await getDb();
    const all = await db.getAll("sessions");
    const valid: GameSession[] = [];
    for (const record of all) {
      const migrated = migrateSessionRecord(record);
      if (migrated) valid.push(migrated);
      else if (record && typeof record === "object" && "id" in record && typeof record.id === "string") await db.delete("sessions", record.id);
    }
    return valid.filter((session) => session.status === "active" || session.status === "paused" || session.status === "generating").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  },
  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("sessions", id);
  },
};
