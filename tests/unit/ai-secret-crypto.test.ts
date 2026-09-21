import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateSecretKey, isKeyNonExtractable } from "@/lib/security/ai-secret-crypto";

describe("AI secret crypto", () => {
  it("encrypts and decrypts with non-extractable AES-GCM key", async () => {
    const key = await generateSecretKey();
    const encrypted = await encryptSecret("sk-test-super-secret", key);
    expect(await isKeyNonExtractable(key)).toBe(true);
    expect(await decryptSecret(encrypted.ciphertext, encrypted.iv, key)).toBe("sk-test-super-secret");
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain("sk-test-super-secret");
  });
  it("uses a fresh IV for every encryption", async () => {
    const key = await generateSecretKey();
    const first = await encryptSecret("same", key);
    const second = await encryptSecret("same", key);
    expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv));
  });
});
