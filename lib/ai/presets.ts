import type { AIProviderProfile } from "./provider";
import { createId } from "@/lib/utils/create-id";

const timestamp = () => new Date().toISOString();

export const DEEPSEEK_PROFILE: AIProviderProfile = {
  id: "deepseek-official", type: "deepseek-official", name: "DeepSeek 官方",
  baseUrl: "https://api.deepseek.com", modelId: "deepseek-flash",
  protocol: "openai-chat-completions", isDefault: true, experimental: false,
  autoFallback: false, enabled: true, updatedAt: timestamp(),
};

export const OPENCODE_GO_PROFILE: AIProviderProfile = {
  id: "opencode-go", type: "opencode-go", name: "OpenCode Go",
  baseUrl: "https://opencode.ai/zen/go/v1", modelId: "deepseek-v4.1-flash",
  protocol: "openai-chat-completions", isDefault: false, experimental: true,
  autoFallback: false, enabled: false, updatedAt: timestamp(),
};

export const AI_PROVIDER_PRESETS = [DEEPSEEK_PROFILE, OPENCODE_GO_PROFILE] as const;

if (AI_PROVIDER_PRESETS.some((profile) => profile.id.includes("zen") || profile.name.toLowerCase().includes("zen"))) {
  throw new Error("OpenCode 免费 Zen 不得注册为 Party Night Provider");
}

export function createCustomProfile(input: { id?: string; name: string; baseUrl: string; modelId: string }): AIProviderProfile {
  return {
    id: input.id ?? createId(), type: "custom-openai", name: input.name,
    baseUrl: input.baseUrl, modelId: input.modelId, protocol: "openai-chat-completions",
    isDefault: false, experimental: false, autoFallback: false, enabled: true, updatedAt: timestamp(),
  };
}

export function getOpenCodeHeaders(sessionId: string, version = "1.2.0"): Record<string, string> {
  return { "User-Agent": `PartyNight/${version}`, "x-opencode-session": sessionId };
}
