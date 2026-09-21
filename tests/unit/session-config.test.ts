import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { sessionConfigSchema } from "@/lib/domain/schemas";

const players = ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" }));

describe("session config", () => {
  it("要求至少两名玩家、一个氛围与一个 pack", () => {
    const base = { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" };
    expect(sessionConfigSchema.safeParse(base).success).toBe(true);
    expect(sessionConfigSchema.safeParse({ ...base, players: [players[0]] }).success).toBe(false);
    expect(sessionConfigSchema.safeParse({ ...base, vibes: [] }).success).toBe(false);
    expect(sessionConfigSchema.safeParse({ ...base, enabledPackIds: [] }).success).toBe(false);
  });
});
