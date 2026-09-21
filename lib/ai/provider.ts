import { z } from "zod";

export const aiProviderTypeSchema = z.enum(["deepseek-official", "opencode-go", "custom-openai"]);
export type AIProviderType = z.infer<typeof aiProviderTypeSchema>;

export const aiProviderProfileSchema = z.object({
  id: z.string().min(1),
  type: aiProviderTypeSchema,
  name: z.string().min(1),
  baseUrl: z.url(),
  modelId: z.string().min(1),
  protocol: z.literal("openai-chat-completions"),
  isDefault: z.boolean(),
  experimental: z.boolean(),
  autoFallback: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});
export type AIProviderProfile = z.infer<typeof aiProviderProfileSchema>;

export interface ProviderRequest {
  profile: AIProviderProfile;
  apiKey: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface AIProviderAdapter {
  generate(request: ProviderRequest): Promise<unknown>;
  test(request: Omit<ProviderRequest, "messages" | "maxTokens">): Promise<{ ok: boolean; latencyMs: number }>;
}
