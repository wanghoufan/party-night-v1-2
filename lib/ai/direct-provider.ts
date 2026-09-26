import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { aiDeckResponseSchema } from "./card-schema";
import { getOpenCodeHeaders } from "./presets";
import { buildDeckPrompt } from "./prompt-builder";
import { providerErrorCodeForException, providerErrorCodeForStatus, type ProviderErrorCode } from "./provider-errors";
import type { AIProviderProfile } from "./provider";
import type { GamePackDefinition, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

/**
 * 前端直连 Provider 的唯一底层实现（Change A / Change B 补充）：
 * 自包含安装包没有 `/api` 代理，但只要用户在设置页存过 Key，浏览器/WebView 就能直接请求
 * Provider 的 OpenAI compatible `chat/completions`；失败一律抛错，由调用方回退本地题库。
 *
 * 三处调用方共用这一条链、禁双实现（都落到 `directChatCompletion`）：
 * 1. 设置页「测试连接」→ `testDirectConnection`；
 * 2. 整局生成 → `requestDeckDirect`（generate-deck）→ `generateDeckDirect`（分块 4 批 × 10 sequential）；
 * 3. 局内后台补题 → `refillPackInBackground` → `resolveDeckTransport`（generate-deck）。
 * transport（WebView 内优先 Capacitor 原生 HTTP 绕过 CORS，不可用回退 fetch；小请求 15s、
 * 生成单批 45s 超时与禁止跨主机重定向）、鉴权（Key 只在 Authorization 头）、URL 校验
 * （https 公网 + 预设锁定）与错误分类（`provider-errors`）都只在这里定义一份。
 *
 * 安全口径：
 * - 只允许 https 公网地址，沿用服务端 server-request 的「https + 禁本机/私网」思想
 *   （浏览器拿不到 DNS，故只做字面量判定：协议、URL 内凭据、localhost/私网/元数据主机）；
 * - Key 只出现在 Authorization 请求头，绝不进 URL、正文、日志或错误信息；
 * - 禁止重定向：fetch 用 `redirect: "error"`，原生用 `disableRedirects` 关闭自动跳转后
 *   再手动校验响应 URL 与目标同源，任何跨主机跳转（可能带走 Key）一律判失败。
 */
const OFFICIAL_BASES: Record<string, string> = {
  "deepseek-official": "https://api.deepseek.com",
  "opencode-go": "https://opencode.ai/zen/go/v1",
};

/** 小请求（测试连接等）超时：小 token 请求 15s 足够。 */
export const DIRECT_TIMEOUT_MS = 15_000;
/**
 * 整局生成单批超时（与测试超时分离，Change C）：整局已分块为多批 sequential 请求，
 * 每批只出 ~10 张小 token，45s 独立计时——手机经 VPN 时旧「单次 12800-token 大请求」
 * 必超 15s 的根因由此解除；任一批成功即并入，全部失败才回退本地。
 */
export const DECK_BATCH_TIMEOUT_MS = 45_000;
/** 整局生成每批目标卡数：40 张拆 4 批 sequential。 */
export const DECK_BATCH_CARD_TARGET = 10;
/** 批失败重试间隔：单批失败（含 JSON 截断/INVALID_OUTPUT）等 1s 再重试 1 次。 */
export const DECK_BATCH_RETRY_DELAY_MS = 1_000;

/**
 * WebView 里 Capacitor 原生 HTTP 是否可用：仅原生平台（Android/iOS）且插件可调用时为 true。
 * 网页/Node 测试环境恒为 false，走 fetch 回退，既有行为与测试口径不变。
 * 原生传输由系统网络栈发请求，可绕过 WebView 的 CORS / 源限制（真机直连被拦的根因）。
 */
export function isNativeHttpAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() === true && typeof CapacitorHttp.request === "function";
  } catch {
    return false;
  }
}

/** 原生请求无法被 AbortSignal 取消：用竞速保住超时口径（到点即抛，底层结果被忽略）。 */
function withDirectTimeout<T>(task: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("provider-timeout")), timeoutMs);
  });
  const aborted = new Promise<never>((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) { reject(new Error("provider-aborted")); return; }
    onAbort = () => reject(new Error("provider-aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([task, timeout, aborted]).finally(() => {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  });
}

/** 原生响应正文归一化：content-type 为 json 时已是对象；否则把字符串按 JSON 解析，失败给空对象。 */
function normalizeNativeBody(data: unknown): unknown {
  if (typeof data !== "string") return data ?? {};
  const text = data.trim();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

/** 手动重定向校验：响应 URL 必须与目标同源，防止原生层自动跳转把 Authorization 头带到第三方主机。 */
function assertNativeRedirectSafe(responseUrl: string | undefined, target: URL): void {
  if (!responseUrl) return;
  let finalUrl: URL;
  try { finalUrl = new URL(responseUrl); } catch { throw new Error("provider-redirect-forbidden"); }
  if (finalUrl.origin !== target.origin) throw new Error("provider-redirect-cross-host");
}

/** 自包含开关：Next 构建期把 NEXT_PUBLIC_SELF_CONTAINED 内联；运行时读取便于测试覆盖。 */
export function isSelfContained(): boolean {
  return process.env.NEXT_PUBLIC_SELF_CONTAINED === "1";
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a! >= 224;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized === "::" || normalized === "::1") return true;
  if (["fc", "fd", "fe8", "fe9", "fea", "feb", "ff"].some((prefix) => normalized.startsWith(prefix)) || normalized.startsWith("2001:db8")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isBlockedIpv4(mapped) : false;
}

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain", "metadata.google.internal"].includes(host)) return true;
  if ([".localhost", ".local", ".internal"].some((suffix) => host.endsWith(suffix))) return true;
  // 浏览器侧拿不到 DNS：只对字面量 IP 判定；主机名（域名）交给 https + redirect:"error" 兜底。
  if (IPV4_LITERAL.test(host)) return isBlockedIpv4(host);
  if (host.includes(":")) return isBlockedIpv6(host);
  return false;
}

/** 直连地址校验：仅 https 公网，禁 URL 内凭据、本机/私网/link-local/metadata 主机。 */
export function resolveDirectEndpoint(baseUrl: string): URL {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("provider-url-invalid"); }
  if (url.username || url.password) throw new Error("provider-url-credentials-forbidden");
  if (url.protocol !== "https:") throw new Error("provider-url-https-required");
  if (isBlockedHost(url.hostname)) throw new Error("provider-host-forbidden");
  return url;
}

/** 预设 Provider 的地址锁定与 OpenCode 显式启用门禁，与服务端 upstream 同口径。 */
function assertPresetPolicy(profile: AIProviderProfile): void {
  const expected = OFFICIAL_BASES[profile.type];
  if (expected) {
    const actual = new URL(profile.baseUrl);
    const target = new URL(expected);
    if (actual.origin + actual.pathname.replace(/\/$/, "") !== target.origin + target.pathname.replace(/\/$/, "")) throw new Error("provider-preset-url-mismatch");
  }
  if (profile.type === "opencode-go" && (!profile.experimental || !profile.enabled || profile.autoFallback)) throw new Error("opencode-explicit-enable-required");
}

function chatCompletionsUrl(base: URL): URL {
  const target = new URL("chat/completions", base.href.endsWith("/") ? base.href : `${base.href}/`);
  if (target.origin !== base.origin) throw new Error("provider-cross-host-path-forbidden");
  return target;
}

export interface DirectChatInput {
  profile: AIProviderProfile;
  apiKey: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  temperature?: number;
  sessionId?: string;
  signal?: AbortSignal;
  /** 超时毫秒数；缺省 15s（小请求口径），整局生成单批传 DECK_BATCH_TIMEOUT_MS。 */
  timeoutMs?: number;
}

export interface DirectChatResult {
  status: number;
  body: unknown;
  latencyMs: number;
}

/**
 * 原生传输（Capacitor HTTP）：由系统网络栈发请求，绕过 WebView 的 CORS 限制。
 * Key 只进 `headers.Authorization`，不进 URL、不进 `data`；`disableRedirects` 关闭自动跳转，
 * 再手动校验响应同源，保证 Key 不会被带到第三方主机。错误信息一律不含 Key。
 */
async function nativeChatCompletion(target: URL, headers: Record<string, string>, data: string, timeoutMs: number, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  let response: { status: number; data: unknown; url?: string };
  try {
    response = await withDirectTimeout(
      CapacitorHttp.request({
        url: target.href,
        method: "POST",
        headers,
        data,
        responseType: "json",
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        disableRedirects: true,
      }),
      timeoutMs,
      signal,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "provider-timeout" || message === "provider-aborted") throw error;
    throw new Error("provider-network-error");
  }
  const status = Number(response?.status ?? 0);
  if (status >= 300 && status < 400) throw new Error("provider-redirect-forbidden");
  assertNativeRedirectSafe(response?.url, target);
  return { status, body: normalizeNativeBody(response?.data) };
}

/**
 * 前端直连一次 `chat/completions`。返回 `{ status, body }` 由调用方按状态码分类；
 * 地址非法、超时、网络失败则抛错（错误信息不含 Key）。
 * 传输优先级：原生平台可用就优先原生（绕过 CORS），否则回退 fetch。
 */
export async function directChatCompletion(input: DirectChatInput): Promise<DirectChatResult> {
  const base = resolveDirectEndpoint(input.profile.baseUrl);
  assertPresetPolicy(input.profile);
  const target = chatCompletionsUrl(base);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.apiKey}`,
    // 浏览器禁止脚本设置 User-Agent，只带会话标识；与上游同源主机，仍满足 OpenCode 的会话要求。
    ...(input.profile.type === "opencode-go" && input.sessionId ? getOpenCodeHeaders(input.sessionId) : {}),
  };
  const payload = JSON.stringify({
    model: input.profile.modelId,
    messages: input.messages,
    max_tokens: input.maxTokens,
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.profile.type === "deepseek-official" ? { response_format: { type: "json_object" }, thinking: { type: "disabled" } } : {}),
  });
  const timeoutMs = input.timeoutMs ?? DIRECT_TIMEOUT_MS;
  const startedAt = Date.now();
  if (isNativeHttpAvailable()) {
    const result = await nativeChatCompletion(target, headers, payload, timeoutMs, input.signal);
    return { ...result, latencyMs: Date.now() - startedAt };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(target.href, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      redirect: "error",
      headers,
      body: payload,
      signal: controller.signal,
    });
    let body: unknown = {};
    try { body = await response.json(); } catch { body = {}; }
    return { status: response.status, body, latencyMs: Date.now() - startedAt };
  } catch {
    if (controller.signal.aborted) throw new Error(input.signal?.aborted ? "provider-aborted" : "provider-timeout");
    throw new Error("provider-network-error");
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/** 直连错误码：把浏览器侧的地址/超时/网络错误映射成既有 ProviderErrorCode。 */
export function directErrorCode(message: string): ProviderErrorCode {
  if (message.includes("provider-network-error")) return "NETWORK_ERROR";
  if (message.includes("provider-aborted")) return "REQUEST_FAILED";
  return providerErrorCodeForException(message);
}

export interface DirectDeckInput {
  profile: AIProviderProfile;
  apiKey: string;
  sessionConfig: SessionConfig;
  sessionId: string;
  targetCardCount?: number;
  /** 分块进度回调：每批结束（成功或失败）各回调一次，供生成页显示「x 张 · 第 x/y 批」。 */
  onProgress?: (progress: DeckBatchProgress) => void;
}

/** 整局生成分块进度：cardsSoFar 为已成功批次的原始 AI 卡累计数。 */
export interface DeckBatchProgress {
  doneBatches: number;
  totalBatches: number;
  cardsSoFar: number;
  /** 最近一次批次失败原因（provider-* 内部标记或 ProviderErrorCode）；批次成功时为 undefined。 */
  lastError?: string;
}

export interface DirectDeckResult {
  data: unknown;
  /** 各失败批次的失败原因（按发生顺序）；全部成功时为空数组。 */
  batchErrors: string[];
}

/**
 * 直连生成整局牌堆原始响应（已校验 schema，分块版，Change C）：
 * - 40 卡拆 4 批 × 10 张 sequential 请求，每批独立 45s 超时（DECK_BATCH_TIMEOUT_MS）——
 *   手机经 VPN 时单次 12800-token 大请求必超 15s 的根因由此解除；
 * - 单批失败（含 max_tokens 截断成不完整 JSON / INVALID_OUTPUT / 网络与上游错误）间隔
 *   1s（DECK_BATCH_RETRY_DELAY_MS）重试 1 次，仍失败才记 batchErrors 继续下一批；
 * - 任一批成功即并入（已成功批次保留），某批失败记下原因继续下一批；
 * - 全部批次失败才抛错，由调用方回退本地题库；generationSource 由最终牌堆是否含 AI 卡判定。
 * 不在此处 buildPlayableDeck，避免与 generate-deck 循环依赖。
 */
export async function generateDeckDirect(input: DirectDeckInput): Promise<DirectDeckResult> {
  const targetCardCount = input.targetCardCount ?? 40;
  const packs = BUILTIN_GAME_PACKS.filter((pack: GamePackDefinition) => input.sessionConfig.enabledPackIds.includes(pack.id));
  const totalBatches = Math.max(1, Math.ceil(targetCardCount / DECK_BATCH_CARD_TARGET));
  const cards: unknown[] = [];
  const batchErrors: string[] = [];
  for (let batch = 0; batch < totalBatches; batch += 1) {
    const batchCardCount = Math.min(DECK_BATCH_CARD_TARGET, targetCardCount - batch * DECK_BATCH_CARD_TARGET);
    const prompt = [
      buildDeckPrompt(input.sessionConfig, batchCardCount, packs),
      totalBatches > 1 ? `本批是第 ${batch + 1}/${totalBatches} 批，每批独立生成，题面不得与本局其他批次重复。` : "",
    ].filter(Boolean).join("\n");
    // 单批输出上限与服务端 app/api/generate-session/route.ts（max_tokens: Math.max(8192, targetCardCount * 320)）
    // 口径联动，禁两处漂移：Change C 分块曾用 Math.max(4096, batchCardCount * 320)，强度 5 长卡面
    // 10 卡 JSON 超 4096 tokens 被 max_tokens 截断成不完整 JSON（`Unterminated string in JSON …`，
    // 真机矩阵 spin-bottle i5 p4 稳定回退 local-fallback 的根因）。现为 8192 起步 + 640/卡
    // （10 卡 → 8192；640/卡为强度 5 长卡面留余量）。不得写更大值试探上限：DeepSeek/OpenCode
    // 的单次输出上限即 8192，超过上游直接 400。
    const requestBatch = async (): Promise<unknown[]> => {
      const result = await directChatCompletion({
        profile: input.profile,
        apiKey: input.apiKey,
        messages: [{ role: "system", content: "输出严格 JSON。" }, { role: "user", content: prompt }],
        maxTokens: Math.max(8192, batchCardCount * 640),
        temperature: .85,
        sessionId: input.sessionId,
        timeoutMs: DECK_BATCH_TIMEOUT_MS,
      });
      if (result.status < 200 || result.status >= 300) throw new Error(providerErrorCodeForStatus(result.status));
      const content = extractAssistantJson(result.body);
      const parsed = aiDeckResponseSchema.safeParse(JSON.parse(content));
      if (!parsed.success) throw new Error("INVALID_OUTPUT");
      return parsed.data.cards;
    };
    try {
      let batchCards: unknown[];
      try {
        batchCards = await requestBatch();
      } catch {
        // 批失败重试 1 次（含截断/INVALID_OUTPUT/网络/上游错误）：间隔 1s 再试，
        // 仍失败才记 batchErrors 继续下一批。重试只在这一层，不动底层 directChatCompletion。
        await new Promise((resolve) => { setTimeout(resolve, DECK_BATCH_RETRY_DELAY_MS); });
        batchCards = await requestBatch();
      }
      cards.push(...batchCards);
    } catch (error) {
      batchErrors.push(error instanceof Error ? error.message : "REQUEST_FAILED");
    }
    input.onProgress?.({ doneBatches: batch + 1, totalBatches, cardsSoFar: cards.length, ...(batchErrors.length ? { lastError: batchErrors[batchErrors.length - 1] } : {}) });
  }
  if (!cards.length) throw new Error(batchErrors[0] ?? "INVALID_OUTPUT");
  return {
    data: { cards, meta: { generatedCount: cards.length, provider: input.profile.name } },
    batchErrors,
  };
}

/** 从 OpenAI compatible 响应里取正文 JSON：兼容 content 非字符串/reasoning_content/分片数组与 markdown 围栏。 */
export function extractAssistantJson(body: unknown): string {
  if (!body || typeof body !== "object") throw new Error("provider-invalid-response");
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error("provider-empty-response");
  const first = choices[0] as { message?: { content?: unknown; reasoning_content?: unknown } };
  let content = first?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    if (typeof first?.message?.reasoning_content === "string" && first.message.reasoning_content.trim()) content = first.message.reasoning_content;
    else if (Array.isArray(content)) content = content.map((part) => typeof part === "string" ? part : typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : "").join("");
  }
  if (typeof content !== "string" || !content.trim()) throw new Error("provider-empty-response");
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const json = (fenced?.[1] ?? content).trim();
  if (!json.startsWith("{")) throw new Error("provider-thinking-leak");
  return json;
}

/** 设置页「测试连接」的自包含实现：真实连通性探测，成功/失败都回结构化结果。 */
export async function testDirectConnection(profile: AIProviderProfile, apiKey: string, sessionId?: string): Promise<{ ok: boolean; latencyMs?: number; code?: string }> {
  try {
    const result = await directChatCompletion({
      profile,
      apiKey,
      messages: [{ role: "user", content: '只回复 JSON：{"ok":true}' }],
      maxTokens: 32,
      temperature: 0,
      sessionId,
    });
    if (result.status < 200 || result.status >= 300) return { ok: false, code: providerErrorCodeForStatus(result.status) };
    return { ok: true, latencyMs: result.latencyMs };
  } catch (error) {
    return { ok: false, code: directErrorCode(error instanceof Error ? error.message : "请求失败") };
  }
}
