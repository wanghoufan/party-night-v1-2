import { gameSessionSchema, type GameSession } from "@/lib/domain/schemas";
import { getDb } from "./db";

export const sessionRepository = {
  async save(session: GameSession): Promise<void> {
    const db = await getDb();
    await db.put("sessions", gameSessionSchema.parse(session));
  },
  async get(id: string): Promise<GameSession | undefined> {
    const db = await getDb();
    const raw = await db.get("sessions", id);
    const parsed = gameSessionSchema.safeParse(raw);
    if (!parsed.success && raw) await db.delete("sessions", id);
    return parsed.success ? parsed.data : undefined;
  },
  async getLatestUnfinished(): Promise<GameSession | undefined> {
    const db = await getDb();
    const all = await db.getAll("sessions");
    const valid: GameSession[] = [];
    for (const record of all) {
      const parsed = gameSessionSchema.safeParse(record);
      if (parsed.success) valid.push(parsed.data);
      else if (record && typeof record === "object" && "id" in record && typeof record.id === "string") await db.delete("sessions", record.id);
    }
    return valid.filter((session) => session.status === "active" || session.status === "paused" || session.status === "generating").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  },
  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("sessions", id);
  },
};
