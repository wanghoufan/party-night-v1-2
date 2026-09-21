import { sessionSummarySchema, type SessionSummary } from "@/lib/domain/schemas";
import { getDb } from "./db";

export const summaryRepository = {
  async save(summary: SessionSummary): Promise<void> { const db = await getDb(); await db.put("sessionSummaries", sessionSummarySchema.parse(summary)); },
  async get(id: string): Promise<SessionSummary | undefined> { const db = await getDb(); const parsed = sessionSummarySchema.safeParse(await db.get("sessionSummaries", id)); return parsed.success ? parsed.data : undefined; },
};
