import { describe, expect, it } from "vitest";
import promptV10Fixture from "../fixtures/ai-prompt-v1.0.json";
import { buildDeckPrompt } from "@/lib/ai/prompt-builder";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GamePackDefinition, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

const V10_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv"];
const NEW_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test"];

const packsFor = (ids: string[]): GamePackDefinition[] => BUILTIN_GAME_PACKS.filter((pack) => ids.includes(pack.id));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: { ...DEFAULT_BOUNDARIES, noPhysicalContact: true, customText: "不讨论家庭住址" },
  enabledPackIds: V10_PACK_IDS, mode: "mixed", ...overrides,
});

describe("AI deck prompt", () => {
  it("constrains boundaryTags to schema enums and keeps custom text out of tags", () => {
    const prompt = buildDeckPrompt(config({ enabledPackIds: ["truth-dare"] }), 10, packsFor(["truth-dare"]));
    expect(prompt).toContain("physical-contact");
    expect(prompt).toContain("不得把自定义文字写入 boundaryTags");
    expect(prompt).toContain("禁止输出中文说明或其他值");
  });

  it("keeps the V1.0 four-pack prompt byte-identical to the frozen regression fixture", () => {
    expect(buildDeckPrompt(config(), 10, packsFor(V10_PACK_IDS))).toBe(promptV10Fixture.prompt);
  });

  it("asks for structured batch cards only when a new AI pack is enabled", () => {
    const prompt = buildDeckPrompt(config({ enabledPackIds: [...V10_PACK_IDS, ...NEW_PACK_IDS] }), 24, packsFor([...V10_PACK_IDS, ...NEW_PACK_IDS]));
    expect(prompt).toContain('"optionA"');
    expect(prompt).toContain('"optionB"');
    expect(prompt).toContain('"type":"pointing"');
    expect(prompt).toContain('"answerMode":"open|binary|choice"');
    expect(prompt).toContain('"options"');
    expect(prompt).toContain("生成 24 张中文游戏卡");
  });

  it("does not leak structured guidance into a V1.0-only deck", () => {
    const prompt = buildDeckPrompt(config(), 10, packsFor(V10_PACK_IDS));
    expect(prompt).not.toContain("optionA");
    expect(prompt).not.toContain("answerMode");
    expect(prompt).not.toContain('"type":"pointing"');
  });

  it("carries the session relationship, vibe, intensity and boundary context into the batch prompt", () => {
    const prompt = buildDeckPrompt(config({ relationship: "couple", vibes: ["flirty", "wild"], intensity: 4 }), 12, packsFor(["would-you-rather"]));
    expect(prompt).toContain("关系：couple");
    expect(prompt).toContain("氛围：flirty、wild");
    expect(prompt).toContain("最高强度：4");
    expect(prompt).toContain("已开启的结构化雷区：physical-contact");
  });

  it("restricts the packId enum to the packs actually enabled", () => {
    const prompt = buildDeckPrompt(config({ enabledPackIds: ["would-you-rather", "pointing-game"] }), 8, packsFor(["would-you-rather", "pointing-game"]));
    expect(prompt).toContain('"packId":"would-you-rather|pointing-game"');
    expect(prompt).not.toContain("truth-dare");
  });
});
