import { describe, expect, it } from "vitest";
import { gameCardSchema, gameSessionSchema, sessionConfigSchema } from "@/lib/domain/schemas";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";

const players = ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" }));

describe("domain schemas", () => {
  it("accepts a minimal session config", () => {
    expect(sessionConfigSchema.parse({ players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" })).toBeTruthy();
  });
  it("rejects invalid card intensity", () => {
    expect(() => gameCardSchema.parse({ id: "x", packId: "p", type: "x", content: "x", intensity: 6, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai" })).toThrow();
  });
  it("requires schema version 1", () => {
    expect(gameSessionSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
});
