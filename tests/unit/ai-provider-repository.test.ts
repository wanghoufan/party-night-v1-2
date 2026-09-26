import { describe, expect, it, vi } from "vitest";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { getDb } from "@/lib/storage/db";
import { encryptSecret } from "@/lib/security/ai-secret-crypto";

// encryptSecret 默认走真实实现；仅让 fallback 用例能强制「持久化失败」。
vi.mock("@/lib/security/ai-secret-crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/ai-secret-crypto")>();
  return { ...actual, encryptSecret: vi.fn(actual.encryptSecret) };
});

describe("encrypted AI secret repository", () => {
  it("never stores plaintext and clears only when requested", async () => {
    const providerId = `test-${crypto.randomUUID()}`;
    const secret = "sk-repository-secret-123456";
    const mode = await aiProviderRepository.saveSecret(providerId, secret, true);
    expect(["persistent", "session-only", "persistent-failed"]).toContain(mode);
    expect(await aiProviderRepository.getSecret(providerId)).toBe(secret);
    const record = await (await getDb()).get("aiSecrets", providerId);
    if (mode === "persistent") {
      expect(record).toBeTruthy();
      expect(JSON.stringify(record)).not.toContain(secret);
    } else expect(record).toBeUndefined();
    await aiProviderRepository.clearSecret(providerId);
    expect(await aiProviderRepository.getSecret(providerId)).toBeUndefined();
  });

  it("returns persistent-failed (not session-only) and keeps the session fallback when encryption persistence fails", async () => {
    vi.mocked(encryptSecret).mockRejectedValueOnce(new Error("secure-key-persistence-unavailable"));
    const providerId = `test-${crypto.randomUUID()}`;
    const secret = "sk-fallback-secret-123456";
    const mode = await aiProviderRepository.saveSecret(providerId, secret, true);
    expect(mode).toBe("persistent-failed");
    // hasSecret 照常为真：仍有本次会话可用的内存密钥
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(true);
    expect(await aiProviderRepository.getSecret(providerId)).toBe(secret);
    // 未落盘：aiSecrets 无记录，也没有明文
    expect(await (await getDb()).get("aiSecrets", providerId)).toBeUndefined();
    await aiProviderRepository.clearSecret(providerId);
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(false);
  });
});
