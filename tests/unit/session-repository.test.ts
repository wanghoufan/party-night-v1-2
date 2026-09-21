import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/storage/db";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { createSession } from "@/lib/engine/session-engine";
import { sessionRepository } from "@/lib/storage/session-repository";

const config = { players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 2 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" as const };

describe("session repository", () => {
  it("round-trips schema-versioned sessions", async () => {
    const session = createSession(config);
    await sessionRepository.save(session);
    expect(await sessionRepository.get(session.id)).toEqual(session);
    await sessionRepository.delete(session.id);
  });

  it("isolates and removes a corrupted record instead of throwing", async () => {
    const db = await getDb();
    await db.put("sessions", { id: "corrupt", status: "active" } as never);
    await expect(sessionRepository.get("corrupt")).resolves.toBeUndefined();
    await expect(sessionRepository.get("corrupt")).resolves.toBeUndefined();
  });
});
