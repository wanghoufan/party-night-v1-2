import { describe, expect, it } from "vitest";
import { AI_PROVIDER_PRESETS, DEEPSEEK_PROFILE, OPENCODE_GO_PROFILE, createCustomProfile, getOpenCodeHeaders } from "@/lib/ai/presets";

describe("AI provider presets", () => {
  it("uses DeepSeek Official as the only default", () => {
    expect(DEEPSEEK_PROFILE.isDefault).toBe(true);
    expect(AI_PROVIDER_PRESETS.filter((profile) => profile.isDefault)).toHaveLength(1);
  });
  it("keeps OpenCode Go experimental and manual-only", () => {
    expect(OPENCODE_GO_PROFILE).toMatchObject({ experimental: true, enabled: false, autoFallback: false });
    expect(getOpenCodeHeaders("stable")).toMatchObject({ "x-opencode-session": "stable", "User-Agent": "PartyNight/1.2.0" });
  });
  it("does not register free Zen", () => expect(AI_PROVIDER_PRESETS.some((profile) => /zen/i.test(profile.name))).toBe(false));
  it("creates custom profiles without default fallback", () => expect(createCustomProfile({ name: "Local", baseUrl: "https://example.com/v1", modelId: "m" })).toMatchObject({ type: "custom-openai", isDefault: false, autoFallback: false }));
});
