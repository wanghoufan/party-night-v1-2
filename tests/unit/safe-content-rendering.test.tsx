import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameCardView } from "@/components/game/GameCardView";
import { RuleDetail } from "@/components/packs/RuleDetail";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";
import { normalizeAICard } from "@/lib/ai/normalize";
import { gameCardSchema, playerSchema } from "@/lib/domain/schemas";
import { defineRuleEntry, ruleEntrySchema } from "@/lib/rules/types";
import { clampText, sanitizePlayerName, sanitizeUntrustedText, stripControlChars, UNTRUSTED_TEXT_LIMITS } from "@/lib/security/untrusted-text";
import type { GameCard } from "@/lib/domain/schemas";

const ROOT = process.cwd();

const card = (overrides: Partial<GameCard> = {}): GameCard => ({
  id: "c1", packId: "ai-improv", type: "improv", content: "用三个词给今晚命名。", instruction: "十秒内完成",
  intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai", ...overrides,
});

/** 同时塞脚本标签与事件属性：只要被当成 HTML 解析，jsdom 里就会出现 script/img 节点并触发事件。 */
const HOSTILE = `<script>window.__pwned="script"</script><img src=x onerror="window.__pwned='img'"><a href="javascript:window.__pwned='link'">点我</a>`;
/** 短字段（如 120 字上限的一句话规则）能放下的版本。 */
const HOSTILE_SHORT = `<script>window.__pwned="script"</script><img src=x onerror="window.__pwned='img'">`;

const tsxFilesUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).filter((entry) => entry.endsWith(".tsx"));
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

describe("外部文本按纯文本安全渲染（T196 / FR-042 / SC-011）", () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).__pwned; });

  it("AI 题目里的 script / 事件属性只当文字显示，不产生可执行节点", () => {
    const { container } = render(<GameCardView card={card({ content: HOSTILE, source: "ai" })} participantNames={[]} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("<script>");
  });

  it("自定义题卡的题面与说明同样不执行 HTML/JS", () => {
    const { container } = render(<GameCardView card={card({ content: HOSTILE, instruction: HOSTILE, source: "custom" })} participantNames={[]} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    expect(screen.getByText("自定义")).toBeInTheDocument();
  });

  it("玩家昵称含脚本/事件属性时按文本显示，不注入节点", () => {
    const { container } = render(<GameCardView card={card()} participantNames={[HOSTILE, "Emma"]} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    expect(screen.getByText(/Emma/)).toBeInTheDocument();
  });

  it("规则文本含脚本/事件属性时按文本显示，不执行", () => {
    const entry = defineRuleEntry({
      id: "hostile-rule", title: "测试规则", category: "other", props: ["无"],
      quickSummary: HOSTILE_SHORT, steps: [{ label: "1", detail: HOSTILE }],
      variants: [{ name: "变体", detail: HOSTILE }], hasHouseRules: true,
    });
    const { container } = render(<RuleDetail entry={entry} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
    expect(screen.getByRole("region", { name: "30 秒看懂" })).toHaveTextContent("<script>");
  });

  it("源码里没有对不可信内容使用原始 HTML 注入", () => {
    for (const dir of ["app", "components"]) {
      for (const file of tsxFilesUnder(dir).concat(readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts")))) {
        expect(read(join(dir, file)), `${dir}/${file} 不得注入原始 HTML`).not.toContain("dangerouslySetInnerHTML");
      }
    }
  });
});

describe("超长文本按 schema 拒绝或规范化（T196 / FR-042）", () => {
  it("gameCardSchema 拒绝超长题面/说明，aiDeck schema 拒绝超长选项", () => {
    expect(gameCardSchema.safeParse(card({ content: "长".repeat(UNTRUSTED_TEXT_LIMITS.cardContent + 1) })).success).toBe(false);
    expect(gameCardSchema.safeParse(card({ instruction: "长".repeat(UNTRUSTED_TEXT_LIMITS.cardInstruction + 1) })).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ packId: "would-you-rather", type: "would-you-rather", optionA: "长".repeat(121), optionB: "短", intensity: 2 }] }).success).toBe(false);
  });

  it("playerSchema 拒绝超长昵称，ruleEntry schema 拒绝超长规则段落", () => {
    expect(playerSchema.safeParse({ id: "p1", displayName: "长".repeat(UNTRUSTED_TEXT_LIMITS.playerName + 1), active: true, createdAt: "x", lastUsedAt: "x" }).success).toBe(false);
    expect(ruleEntrySchema.safeParse({ id: "r", title: "t", category: "other", props: [], quickSummary: "长".repeat(UNTRUSTED_TEXT_LIMITS.ruleSummary + 1), steps: [{ detail: "d" }] }).success).toBe(false);
    expect(ruleEntrySchema.safeParse({ id: "r", title: "t", category: "other", props: [], quickSummary: "s", steps: [{ detail: "长".repeat(UNTRUSTED_TEXT_LIMITS.ruleStep + 1) }] }).success).toBe(false);
  });

  it("边界处对不可信文本去控制字符并钳制长度（规范化）", () => {
    expect(stripControlChars("a\u0000b\u001Fc\u007Fd")).toBe("abcd");
    expect(sanitizeUntrustedText("  hi\u0007  ", 10)).toBe("hi");
    expect(sanitizeUntrustedText("长".repeat(600), UNTRUSTED_TEXT_LIMITS.cardContent)).toHaveLength(UNTRUSTED_TEXT_LIMITS.cardContent);
    expect(clampText("abc", 2)).toBe("ab");
    expect(sanitizePlayerName("  ", "玩家 1")).toBe("玩家 1");
    expect(sanitizePlayerName("A".repeat(40), "玩家 1")).toHaveLength(UNTRUSTED_TEXT_LIMITS.playerName);
  });

  it("AI 卡归一化时清掉控制字符，落库内容不含不可见控制符", () => {
    const normalized = normalizeAICard({ ...card({ content: `今晚\u0000玩什么\u0007` }) });
    expect(normalized.content).toBe("今晚玩什么");
  });
});
