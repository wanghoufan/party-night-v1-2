import { describe, expect, it } from "vitest";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { getDb } from "@/lib/storage/db";

describe("encrypted AI secret repository", () => {
  it("never stores plaintext and clears only when requested", async () => {
    const providerId = `test-${crypto.randomUUID()}`;
    const secret = "sk-repository-secret-123456";
    const mode = await aiProviderRepository.saveSecret(providerId, secret, true);
    expect(["persistent", "session-only"]).toContain(mode);
    expect(await aiProviderRepository.getSecret(providerId)).toBe(secret);
    const record = await (await getDb()).get("aiSecrets", providerId);
    if (mode === "persistent") {
      expect(record).toBeTruthy();
      expect(JSON.stringify(record)).not.toContain(secret);
    } else expect(record).toBeUndefined();
    await aiProviderRepository.clearSecret(providerId);
    expect(await aiProviderRepository.getSecret(providerId)).toBeUndefined();
  });
});
