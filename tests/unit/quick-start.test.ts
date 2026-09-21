import { describe, expect, it } from "vitest";
import { deriveQuickStartConfig } from "@/lib/engine/quick-start";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";

const previous = { players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely"], mode: "mixed" as const };

describe("quick start", () => {
  it("reuses preferences but locks to one pack", () => expect(deriveQuickStartConfig(previous, "most-likely")).toMatchObject({ mode: "single", enabledPackIds: ["most-likely"] }));
  it("requires a previous valid config", () => expect(deriveQuickStartConfig(undefined, "most-likely")).toBeUndefined());
});
