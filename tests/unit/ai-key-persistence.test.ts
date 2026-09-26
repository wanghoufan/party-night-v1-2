import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { getDb, resetDbForTests } from "@/lib/storage/db";
import { redactText, redactUnknown, safeErrorMessage } from "@/lib/ai/redaction";
import type { AIProviderProfile } from "@/lib/ai/provider";
import { reconcileSessionStore } from "@/lib/storage/session-maintenance";
import { sessionRepository } from "@/lib/storage/session-repository";
import { CURRENT_SESSION_SCHEMA_VERSION } from "@/lib/storage/session-migration";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard } from "@/lib/domain/schemas";

/**
 * AI Key 持久化边界（B-1 补件）：
 * 只有 aiProviderRepository.saveSecret(persist=true) 会落盘密文，落盘后能跨「重启」读回；
 * 其余一切路径（读写 Provider 配置、Session 保存/迁移/隔离/删除、启动 reconcile）都不得碰 aiSecrets / aiCryptoKeys；
 * 只有 clearSecret 会删；任何日志/导出/序列化路径都拿不到明文 Key。
 */

const KEY_ID = "party-night-ai-secret-key-v1";
const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const KEY_A = "sk-key-persistence-alpha-0001";
const KEY_B = "sk-key-persistence-bravo-0002";
const KEY_A2 = "sk-key-persistence-alpha-rotated-0003";
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const players = ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "2026-09-20T00:00:00.000Z", lastUsedAt: "2026-09-20T00:00:00.000Z" }));

const card = (id: string, packId: string): GameCard => ({
  id, packId, type: "truth", content: id, intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin",
});

/** V1.x 落库形态：schemaVersion=1，缺 currentPackId / currentPackState / recentRejectedFingerprints —— 专喂迁移路径。 */
function legacySessionRecord(id: string) {
  return {
    schemaVersion: 1, id, status: "active", mode: "mixed",
    config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare", "never-have"], mode: "mixed" },
    deckSnapshot: [card("c1", "truth-dare")], usedCardIds: [],
    rounds: [{ id: "r1", cardId: "c1", packId: "never-have", participantIds: ["a"], status: "completed", startedAt: "2026-09-20T00:30:00.000Z", endedAt: "2026-09-20T00:31:00.000Z" }],
    startedAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T01:00:00.000Z",
  };
}

const profile = (id: string, overrides: Partial<AIProviderProfile> = {}): AIProviderProfile => ({
  id, type: "deepseek-official", name: "DeepSeek 官方", baseUrl: "https://api.deepseek.com",
  modelId: "deepseek-chat", protocol: "openai-chat-completions", isDefault: false, experimental: false,
  autoFallback: false, enabled: true, updatedAt: "2026-09-26T00:00:00.000Z", ...overrides,
});

const db = () => getDb();
const secretRecord = async (providerId: string) => (await db()).get("aiSecrets", providerId);
const cryptoKeyRecord = async () => (await db()).get("aiCryptoKeys", KEY_ID);

afterEach(async () => {
  const store = await db();
  await Promise.all([
    store.clear("aiSecrets"), store.clear("aiCryptoKeys"), store.clear("aiProviderProfiles"),
    store.clear("sessions"), store.clear("sessionQuarantine"), store.clear("sessionSummaries"),
  ]);
});

describe("aiProviderRepository：persist=true 才落盘，且落盘后读得回", () => {
  it("saveSecret(persist=true) 落密文，重读仍在、明文不入库", async () => {
    const providerId = newId("persist");
    const mode = await aiProviderRepository.saveSecret(providerId, KEY_A, true);
    expect(mode).toBe("persistent");

    expect(await aiProviderRepository.hasSecret(providerId)).toBe(true);
    expect(await aiProviderRepository.getSecret(providerId)).toBe(KEY_A);

    const record = await secretRecord(providerId);
    expect(record).toBeTruthy();
    // 落盘骨架：只有密文/IV 元数据，没有 apiKey/secret/明文
    expect(Object.keys(record!).sort()).toEqual(["algorithm", "ciphertext", "cryptoVersion", "iv", "providerProfileId", "updatedAt"]);
    expect(JSON.stringify(record)).not.toContain(KEY_A);
    expect(await cryptoKeyRecord()).toBeTruthy();
  });

  it("persist=false 只留在本次会话，不写 aiSecrets", async () => {
    const providerId = newId("session-only");
    expect(await aiProviderRepository.saveSecret(providerId, KEY_A, false)).toBe("session-only");
    expect(await aiProviderRepository.getSecret(providerId)).toBe(KEY_A);
    expect(await secretRecord(providerId)).toBeUndefined();
  });

  it("模拟重启：resetDbForTests 后重开连接、并换新模块实例，仍读得回（证明不是内存兜底）", async () => {
    const providerId = newId("restart");
    const ephemeralId = newId("restart-ephemeral");
    expect(await aiProviderRepository.saveSecret(providerId, KEY_A, true)).toBe("persistent");
    expect(await aiProviderRepository.saveSecret(ephemeralId, KEY_B, false)).toBe("session-only");

    await resetDbForTests();            // 关闭当前 IndexedDB 连接
    vi.resetModules();                  // 丢掉模块级内存态（含 sessionSecrets 兜底 Map）
    const fresh = await import("@/lib/storage/ai-provider-repository"); // 重启后新实例

    // 反向对照：会话态 Key 随重启消失 → 证明新实例的内存兜底确实是空的
    expect(await fresh.aiProviderRepository.hasSecret(ephemeralId)).toBe(false);
    // 持久化 Key 仍在 → 只可能来自 IndexedDB 密文
    expect(await fresh.aiProviderRepository.hasSecret(providerId)).toBe(true);
    expect(await fresh.aiProviderRepository.getSecret(providerId)).toBe(KEY_A);
    expect(await (await getDb()).get("aiSecrets", providerId)).toBeTruthy();
  });
});

describe("Provider 配置读写不碰 secret", () => {
  it("saveProfile（新建）与再次 saveProfile（更新）都不动 aiSecrets / aiCryptoKeys，也不把 Key 写进 profile", async () => {
    const providerId = newId("profile");
    await aiProviderRepository.saveSecret(providerId, KEY_A, true);
    const secretBefore = await secretRecord(providerId);
    const keyBefore = await cryptoKeyRecord();

    await aiProviderRepository.saveProfile(profile(providerId));
    // 仓库没有独立的 updateProfile：更新走同一个 put 路径（同 id 覆盖）
    await aiProviderRepository.saveProfile(profile(providerId, { name: "DeepSeek（改名）", updatedAt: "2026-09-26T09:00:00.000Z" }));

    expect(await aiProviderRepository.getSecret(providerId)).toBe(KEY_A);
    expect(await secretRecord(providerId)).toEqual(secretBefore);
    expect(await cryptoKeyRecord()).toEqual(keyBefore);
    const storedProfile = await (await db()).get("aiProviderProfiles", providerId);
    expect(storedProfile?.name).toBe("DeepSeek（改名）");
    expect(JSON.stringify(storedProfile)).not.toContain(KEY_A);
  });

  it("ensurePresets / listProfiles 不创建也不删除 secret 记录", async () => {
    const providerId = newId("presets");
    await aiProviderRepository.saveSecret(providerId, KEY_A, true);
    const secretBefore = await secretRecord(providerId);

    await aiProviderRepository.ensurePresets();
    await aiProviderRepository.listProfiles();

    expect(await aiProviderRepository.getSecret(providerId)).toBe(KEY_A);
    expect(await secretRecord(providerId)).toEqual(secretBefore);
  });
});

describe("多 Provider Key 互不覆盖", () => {
  it("两个 Provider 各存各的，更新其中一个不串另一个", async () => {
    const alpha = newId("multi-alpha");
    const bravo = newId("multi-bravo");
    await aiProviderRepository.saveSecret(alpha, KEY_A, true);
    await aiProviderRepository.saveSecret(bravo, KEY_B, true);

    expect(await aiProviderRepository.getSecret(alpha)).toBe(KEY_A);
    expect(await aiProviderRepository.getSecret(bravo)).toBe(KEY_B);
    const [recordA, recordB] = [await secretRecord(alpha), await secretRecord(bravo)];
    expect(recordA?.providerProfileId).toBe(alpha);
    expect(recordB?.providerProfileId).toBe(bravo);
    expect(Buffer.from(recordA!.ciphertext).equals(Buffer.from(recordB!.ciphertext))).toBe(false);

    await aiProviderRepository.saveSecret(alpha, KEY_A2, true);
    expect(await aiProviderRepository.getSecret(alpha)).toBe(KEY_A2);
    expect(await aiProviderRepository.getSecret(bravo)).toBe(KEY_B);
  });

  it("会话态覆盖不会顶掉另一个 Provider 的持久化 Key", async () => {
    const alpha = newId("mix-alpha");
    const bravo = newId("mix-bravo");
    await aiProviderRepository.saveSecret(alpha, KEY_A, true);
    await aiProviderRepository.saveSecret(bravo, KEY_B, true);

    await aiProviderRepository.saveSecret(alpha, KEY_A2, false);
    expect(await aiProviderRepository.getSecret(alpha)).toBe(KEY_A2);
    expect(await aiProviderRepository.getSecret(bravo)).toBe(KEY_B);
    expect((await secretRecord(alpha))?.updatedAt).toBeTruthy();
  });
});

describe("Session 删除 / 迁移 / 启动 reconcile 都不碰 aiSecrets 与 aiCryptoKeys", () => {
  it("save → get（含 v1 迁移）→ reconcile → delete 全程密钥记录逐字节不变", async () => {
    const providerId = newId("session-lane");
    expect(await aiProviderRepository.saveSecret(providerId, KEY_A, true)).toBe("persistent");
    const secretBefore = await secretRecord(providerId);
    const keyBefore = await cryptoKeyRecord();
    const secretCountBefore = (await (await db()).getAll("aiSecrets")).length;

    // 真实 Session 路径：新记录写入 + 读取
    const sessionId = newId("session");
    const now = new Date().toISOString();
    await sessionRepository.save({
      schemaVersion: CURRENT_SESSION_SCHEMA_VERSION, id: sessionId, status: "active", mode: "mixed",
      config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare"], mode: "mixed" },
      deckSnapshot: [card("c1", "truth-dare")], usedCardIds: [], rounds: [],
      currentPackId: "truth-dare", updatedAt: now,
    } as never);
    expect((await sessionRepository.get(sessionId))?.id).toBe(sessionId);

    // 真实迁移路径：v1 旧记录 → get 触发 migrateSessionRecord → 启动 reconcile 原地升级
    const legacyId = newId("legacy");
    await (await db()).put("sessions", legacySessionRecord(legacyId) as never);
    expect((await sessionRepository.get(legacyId))?.id).toBe(legacyId);
    expect(await reconcileSessionStore()).toMatchObject({ ok: true });

    // 删除 Session（不是删 Key）
    await sessionRepository.delete(sessionId);
    await sessionRepository.delete(legacyId);

    expect(await aiProviderRepository.getSecret(providerId)).toBe(KEY_A);
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(true);
    expect(await secretRecord(providerId)).toEqual(secretBefore);
    expect(await cryptoKeyRecord()).toEqual(keyBefore);
    expect((await (await db()).getAll("aiSecrets")).length).toBe(secretCountBefore);
  });

  it("只有 clearSecret 删除：其他所有路径跑完记录仍在，clearSecret 后 aiSecrets 清、aiCryptoKeys 保留", async () => {
    const providerId = newId("only-clear");
    await aiProviderRepository.saveSecret(providerId, KEY_A, true);
    await aiProviderRepository.saveProfile(profile(providerId));
    await aiProviderRepository.ensurePresets();
    await aiProviderRepository.listProfiles();
    await sessionRepository.delete(newId("never-saved"));
    await reconcileSessionStore();

    expect(await secretRecord(providerId)).toBeTruthy();

    await aiProviderRepository.clearSecret(providerId);

    expect(await aiProviderRepository.getSecret(providerId)).toBeUndefined();
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(false);
    expect(await secretRecord(providerId)).toBeUndefined();
    // 加密主密钥不在 clearSecret 的职责里，保留
    expect(await cryptoKeyRecord()).toBeTruthy();
  });

  it("clearSecret 同时清掉会话态兜底 Key", async () => {
    const providerId = newId("clear-ephemeral");
    await aiProviderRepository.saveSecret(providerId, KEY_A, false);
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(true);
    await aiProviderRepository.clearSecret(providerId);
    expect(await aiProviderRepository.hasSecret(providerId)).toBe(false);
  });
});

describe("明文 Key 不进日志 / 导出 / 序列化", () => {
  it("关键序列化与脱敏函数拿不到完整 Key", () => {
    expect(redactText(`provider failed with ${KEY_A}`)).not.toContain(KEY_A);
    expect(safeErrorMessage(new Error(`upstream 401 for ${KEY_A}`))).not.toContain(KEY_A);
    expect(JSON.stringify(redactUnknown({ error: { message: `boom ${KEY_A}`, apiKey: KEY_A, authorization: `Bearer ${KEY_A}` } }))).not.toContain(KEY_A);
  });

  it("导出/备份形状的负载（含 aiSecrets / aiCryptoKeys 记录）脱敏后无明文", async () => {
    const providerId = newId("export");
    await aiProviderRepository.saveSecret(providerId, KEY_A, true);
    const bundle = {
      exportedAt: "2026-09-26T00:00:00.000Z",
      aiSecrets: [await secretRecord(providerId)],
      aiCryptoKeys: [await cryptoKeyRecord()],
      aiProviderProfiles: [profile(providerId)],
    };
    // 磁盘快照本身不含明文：导出 aiSecrets 带出的只有密文与 IV
    expect(JSON.stringify(bundle)).not.toContain(KEY_A);

    // 反向对照：外部混入明文（日志行/自定义文本）时确实扫得出，脱敏后必须消失
    const withPlaintext = { ...bundle, log: [`token=${KEY_A}`], sessions: [{ config: { customText: KEY_A } }] };
    expect(JSON.stringify(withPlaintext)).toContain(KEY_A);
    const redacted = JSON.stringify(redactUnknown(withPlaintext));
    expect(redacted).not.toContain(KEY_A);
    expect(redacted).toContain("[REDACTED]");
  });

  it("源码扫描：唯一写 aiSecrets/aiCryptoKeys 的文件只写密文，且无 console 打印密钥", () => {
    const repository = read("lib/storage/ai-provider-repository.ts");
    expect(repository).toMatch(/ciphertext/);
    expect(repository).toMatch(/AES-GCM/);
    // 写 aiSecrets 的对象字面量里不得出现 apiKey / secret 明文键
    expect(repository).not.toMatch(/put\(\s*"aiSecrets"\s*,\s*\{[^}]*\b(apiKey|plaintext|secret)\b/s);
    expect(repository).not.toMatch(/console\.(log|info|warn|error)\(/);
    // 落库的 Provider 配置 schema 里没有存 Key 的字段（Key 只走后端 Authorization 头，不随 profile 进 IndexedDB）
    const providerSource = read("lib/ai/provider.ts");
    const profileSchemaBlock = providerSource.match(/aiProviderProfileSchema = z\.object\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
    expect(profileSchemaBlock).not.toBe("");
    expect(profileSchemaBlock).not.toMatch(/api[-_]?key|secret/i);
  });
});
