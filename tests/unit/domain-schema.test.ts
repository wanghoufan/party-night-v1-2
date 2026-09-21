import { describe, expect, it } from "vitest";
import { SESSION_SCHEMA_VERSION, gameCardSchema, gamePackDefinitionSchema, gameSessionSchema, sessionConfigSchema } from "@/lib/domain/schemas";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";

const players = ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" }));

describe("domain schemas", () => {
  it("accepts a minimal session config", () => {
    expect(sessionConfigSchema.parse({ players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" })).toBeTruthy();
  });
  it("rejects invalid card intensity", () => {
    expect(() => gameCardSchema.parse({ id: "x", packId: "p", type: "x", content: "x", intensity: 6, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai" })).toThrow();
  });
  it("accepts a session on the current schema version and rejects pre-migration records", () => {
    const session = {
      schemaVersion: SESSION_SCHEMA_VERSION, id: "s", status: "active", mode: "single",
      config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" },
      deckSnapshot: [], usedCardIds: [], rounds: [], currentPackId: "truth-dare", updatedAt: "x",
    };
    expect(gameSessionSchema.safeParse(session).success).toBe(true);
    expect(gameSessionSchema.safeParse({ ...session, schemaVersion: SESSION_SCHEMA_VERSION - 1 }).success).toBe(false);
    expect(gameSessionSchema.safeParse({ ...session, currentPackId: undefined }).success).toBe(false);
  });
  it("accepts an explicit pack capability block", () => {
    const pack = {
      id: "spin-bottle", name: "转瓶子", icon: "bottle", enabledByDefault: true, mixable: false,
      minPlayers: 2, supportedCardTypes: ["spin"], weight: 1, source: "builtin" as const,
      capability: { requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true, renderer: "spin" as const },
    };
    expect(gamePackDefinitionSchema.safeParse(pack).success).toBe(true);
    expect(gamePackDefinitionSchema.safeParse({ ...pack, capability: { ...pack.capability, renderer: "hologram" } }).success).toBe(false);
  });
});
