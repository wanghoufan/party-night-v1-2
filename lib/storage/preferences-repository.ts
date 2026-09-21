import type { AppPreferences } from "./db";
import { getDb } from "./db";

const empty = (): AppPreferences => ({ id: "main", recentPlayers: [], updatedAt: new Date().toISOString() });

export const preferencesRepository = {
  async get(): Promise<AppPreferences> {
    const db = await getDb();
    return (await db.get("preferences", "main")) ?? empty();
  },
  async save(value: Omit<AppPreferences, "id" | "updatedAt">): Promise<AppPreferences> {
    const db = await getDb();
    const current = await db.get("preferences", "main");
    const record: AppPreferences = { ...current, ...value, id: "main", updatedAt: new Date().toISOString() };
    await db.put("preferences", record);
    return record;
  },
};
