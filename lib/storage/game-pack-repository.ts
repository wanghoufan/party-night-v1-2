import { customGamePackSchema, type CustomGamePack } from "@/lib/domain/schemas";
import { getDb } from "./db";

export const gamePackRepository = {
  async list(): Promise<CustomGamePack[]> {
    const db = await getDb();
    const records = await db.getAll("gamePacks");
    return records.flatMap((record) => {
      const parsed = customGamePackSchema.safeParse(record);
      return parsed.success ? [parsed.data] : [];
    });
  },
  async get(id: string): Promise<CustomGamePack | undefined> {
    const db = await getDb();
    const parsed = customGamePackSchema.safeParse(await db.get("gamePacks", id));
    return parsed.success ? parsed.data : undefined;
  },
  async save(pack: CustomGamePack): Promise<void> {
    const db = await getDb();
    await db.put("gamePacks", customGamePackSchema.parse(pack));
  },
  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("gamePacks", id);
  },
};
