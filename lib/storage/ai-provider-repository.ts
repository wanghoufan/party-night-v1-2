import { aiProviderProfileSchema, type AIProviderProfile } from "@/lib/ai/provider";
import { AI_PROVIDER_PRESETS } from "@/lib/ai/presets";
import { decryptSecret, encryptSecret, generateSecretKey, isKeyNonExtractable } from "@/lib/security/ai-secret-crypto";
import { getDb, type AICryptoKeyRecord, type AISecretRecord } from "./db";

const KEY_ID = "party-night-ai-secret-key-v1" as const;
const sessionSecrets = new Map<string, string>();

async function persistentCryptoKey(): Promise<CryptoKey> {
  const db = await getDb();
  const existing = await db.get("aiCryptoKeys", KEY_ID);
  if (existing?.key && await isKeyNonExtractable(existing.key)) return existing.key;
  const key = await generateSecretKey();
  const record: AICryptoKeyRecord = { id: KEY_ID, key, createdAt: new Date().toISOString() };
  await db.put("aiCryptoKeys", record);
  const verified = await db.get("aiCryptoKeys", KEY_ID);
  if (!verified?.key || !(await isKeyNonExtractable(verified.key))) throw new Error("secure-key-persistence-unavailable");
  return verified.key;
}

export const aiProviderRepository = {
  async ensurePresets(): Promise<AIProviderProfile[]> {
    const db = await getDb();
    for (const preset of AI_PROVIDER_PRESETS) if (!(await db.get("aiProviderProfiles", preset.id))) await db.put("aiProviderProfiles", { ...preset });
    return this.listProfiles();
  },
  async listProfiles(): Promise<AIProviderProfile[]> {
    const db = await getDb();
    return (await db.getAll("aiProviderProfiles")).flatMap((profile) => {
      const parsed = aiProviderProfileSchema.safeParse(profile);
      return parsed.success ? [parsed.data] : [];
    }).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  },
  async saveProfile(profile: AIProviderProfile): Promise<void> {
    const db = await getDb();
    await db.put("aiProviderProfiles", aiProviderProfileSchema.parse(profile));
  },
  async saveSecret(providerId: string, secret: string, persist: boolean): Promise<"persistent" | "session-only" | "persistent-failed"> {
    if (!secret.trim()) throw new Error("empty-secret");
    if (!persist) { sessionSecrets.set(providerId, secret); return "session-only"; }
    try {
      const db = await getDb();
      const key = await persistentCryptoKey();
      const encrypted = await encryptSecret(secret, key);
      const record: AISecretRecord = { providerProfileId: providerId, ...encrypted, algorithm: "AES-GCM", cryptoVersion: 1, updatedAt: new Date().toISOString() };
      await db.put("aiSecrets", record);
      sessionSecrets.delete(providerId);
      return "persistent";
    } catch {
      // 用户勾了「保存到本机」但加密持久化失败：仍退化为会话内存，但必须回报第三种状态，
      // 让设置页给出强提醒（重启即丢），不得静默当作正常 session-only。
      sessionSecrets.set(providerId, secret);
      return "persistent-failed";
    }
  },
  async getSecret(providerId: string): Promise<string | undefined> {
    const ephemeral = sessionSecrets.get(providerId);
    if (ephemeral) return ephemeral;
    try {
      const db = await getDb();
      const [record, keyRecord] = await Promise.all([db.get("aiSecrets", providerId), db.get("aiCryptoKeys", KEY_ID)]);
      if (!record || !keyRecord?.key) return undefined;
      return await decryptSecret(record.ciphertext, record.iv, keyRecord.key);
    } catch { return undefined; }
  },
  async hasSecret(providerId: string): Promise<boolean> { return Boolean(await this.getSecret(providerId)); },
  async clearSecret(providerId: string): Promise<void> {
    sessionSecrets.delete(providerId);
    const db = await getDb();
    await db.delete("aiSecrets", providerId);
  },
};
