import { describe, expect, it } from "vitest";
import { buildDeckPrompt } from "@/lib/ai/prompt-builder";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

describe("AI deck prompt", () => {
  it("constrains boundaryTags to schema enums and keeps custom text out of tags", () => {
    const prompt = buildDeckPrompt({
      players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
      relationship: "friends", vibes: ["funny"], intensity: 3,
      boundaries: { ...DEFAULT_BOUNDARIES, noPhysicalContact: true, customText: "不讨论家庭住址" },
      enabledPackIds: ["truth-dare"], mode: "single",
    }, 10, BUILTIN_GAME_PACKS.filter((pack) => pack.id === "truth-dare"));
    expect(prompt).toContain("physical-contact");
    expect(prompt).toContain("不得把自定义文字写入 boundaryTags");
    expect(prompt).toContain("禁止输出中文说明或其他值");
  });
});
