import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { redactText, redactUnknown, safeErrorMessage } from "@/lib/ai/redaction";

/**
 * 凭据泄漏审计（T198 / FR-041 / SC-012）：
 * 日志、错误序列化、导出/备份负载、Service Worker 缓存四条外泄路径都不得带出完整 API Key；
 * 系统托管 Key 只在服务端，用户 BYOK 只走既有本地加密库；设置文案不得把浏览器持久化说成强机密存储。
 */

const KEY = "sk-credential-leak-audit-must-not-appear";
const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

/** 导出/备份最可能的形状：Session 快照 + 偏好 + Provider 配置一把梭。 */
const exportBundle = {
  exportedAt: "2026-09-21T00:00:00.000Z",
  preferences: { id: "main", activeProviderId: "p1" },
  providerProfiles: [{ id: "p1", baseUrl: "https://api.deepseek.com", apiKey: KEY, authorization: `Bearer ${KEY}` }],
  sessions: [{ id: "s1", config: { customText: `紧急联系 ${KEY}` } }],
  log: [`provider failed with ${KEY}`, `api_key=${KEY}`],
};

describe("凭据不进日志 / 错误序列化 / 导出备份 / SW 缓存（T198）", () => {
  it("日志与错误序列化统一走脱敏：文本、对象、嵌套结构都拿不到完整 Key", () => {
    expect(redactText(`fetch failed with ${KEY}`)).not.toContain(KEY);
    expect(safeErrorMessage(new Error(`upstream 401 for ${KEY}`))).not.toContain(KEY);
    expect(JSON.stringify(redactUnknown(exportBundle))).not.toContain(KEY);
    expect(JSON.stringify(redactUnknown(new Error(`boom ${KEY}`)))).not.toContain(KEY);
  });

  it("导出/备份负载里的 Provider 密钥字段被整键抹掉", () => {
    const redacted = redactUnknown(exportBundle) as Record<string, unknown>;
    const serialized = JSON.stringify(redacted);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(KEY);
    expect(serialized).toContain("sessions");
  });

  it("审计的不是玩具数据：明文 Key 确实被抹干净，红线校验有效", () => {
    // 反向对照，证明上面的断言不是空跑
    expect(JSON.stringify(exportBundle)).toContain(KEY);
  });
});

describe("系统 Key 只存在服务端（T198 / FR-041）", () => {
  it("没有任何客户端可见的密钥环境变量", () => {
    for (const file of ["lib/ai/provider.ts", "lib/ai/upstream.ts", "lib/ai/generate-deck.ts", "app/settings/ai/page.tsx", "lib/storage/ai-provider-repository.ts"]) {
      const source = read(file);
      expect(source, `${file} 不得读取客户端可见的密钥 env`).not.toMatch(/NEXT_PUBLIC_[A-Z_]*KEY/);
      expect(source, `${file} 不得直接读服务端 env`).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    }
  });

  it("生成/测试路由只从 Authorization 头取 Key，且 env 回退在生产禁用", () => {
    for (const route of ["app/api/generate-session/route.ts", "app/api/test-provider/route.ts"]) {
      const source = read(route);
      expect(source).toContain("Bearer ");
      expect(source).toMatch(/get\("authorization"\)/);
    }
    const generate = read("app/api/generate-session/route.ts");
    expect(generate).toMatch(/process\.env\.NODE_ENV !== "production"/);
    expect(generate).toContain("PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK");
  });
});

describe("用户 BYOK 只走既有本地加密库（T198 / FR-041）", () => {
  it("持久化 Key 只有一条路径：AES-GCM 密文 + 不可导出 CryptoKey", () => {
    const repository = read("lib/storage/ai-provider-repository.ts");
    expect(repository).toMatch(/AES-GCM/);
    expect(repository).toContain("aiSecrets");
    expect(repository).toContain("aiCryptoKeys");
    // 明文不得落盘：写入的只有 ciphertext/iv 元数据
    expect(repository).toMatch(/ciphertext/);
    expect(repository).not.toMatch(/put\(\s*"aiSecrets"\s*,\s*\{[^}]*\bapiKey\b/s);
  });

  it("设置文案不把浏览器持久化说成强机密存储", () => {
    const page = read("app/settings/ai/page.tsx");
    for (const banned of ["安全保管", "保险箱", "绝对安全", "军事级", "不可破解", "万无一失"]) {
      expect(page, `设置页不得出现「${banned}」这类强机密表述`).not.toContain(banned);
    }
    // 必须明确说明只是本地便利模式，而不是强机密存储
    expect(page).toMatch(/便利/);
    expect(page).toMatch(/不等同|不代表|并非/);
  });
});

describe("Service Worker 不缓存凭据外泄路径（T198 / FR-041）", () => {
  it("AI 接口与导出/备份路径永不进 cache", () => {
    const sw = read("public/sw.js");
    for (const prefix of ["/api/", "/export/", "/backup/"]) {
      expect(sw).toContain(prefix);
    }
    expect(sw).toMatch(/NEVER_CACHE_PREFIXES/);
    expect(sw).toMatch(/no-store\|private|no-store/);
  });
});
