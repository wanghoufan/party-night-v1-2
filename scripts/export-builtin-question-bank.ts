import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameCard } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

/**
 * 把内置离线题库导出成人工审查用的 Markdown（一包一档，表列：编号/题面/强度/说明/boundary）。
 * 唯一数据源是 `lib/game-packs/built-in-seeds/index.ts`，本脚本只读不写业务数据，可反复重跑覆盖。
 */
interface QuestionBankExport {
  /** 输出文件名（不含扩展名）。 */
  file: string;
  /** 文档标题里的玩法名。 */
  title: string;
  /** 种子卡的 packId。 */
  packId: string;
  /** 种子卡的 type。 */
  type: string;
}

const EXPORTS: QuestionBankExport[] = [
  { file: "01-真心话", title: "真心话", packId: "truth-dare", type: "truth" },
  { file: "02-大冒险", title: "大冒险", packId: "truth-dare", type: "dare" },
  { file: "03-谁最可能", title: "谁最可能", packId: "most-likely", type: "vote" },
  { file: "04-我从来没有", title: "我从来没有", packId: "never-have", type: "statement" },
  { file: "05-二选一", title: "二选一", packId: "would-you-rather", type: "would-you-rather" },
  { file: "06-指人游戏", title: "指人游戏", packId: "pointing-game", type: "pointing" },
  { file: "07-默契测试", title: "默契测试", packId: "compatibility-test", type: "compatibility" },
];

/** 无题卡玩法：自己不出题卡，只在每份 md 顶部备注，避免审查时误以为漏导。 */
const CARDLESS_PACKS: { id: string; name: string }[] = [
  { id: "spin-bottle", name: "转瓶子" },
  { id: "ai-improv", name: "随机启动器「随机玩一个」" },
];

/** 内置种子题卡总数（7 包合计），导出数量对不上直接报错，防止静默漏卡。 */
const EXPECTED_CARD_TOTAL = 350;

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "content", "题库审查");

/** 单元格转义：换行折成 `<br>`，竖线转义，避免撑坏表格。 */
const escapeCell = (text: string): string => text.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");

const boundaryCell = (tags: GameCard["boundaryTags"]): string => (tags.length ? tags.join("、") : "—");

function renderEntry(entry: QuestionBankExport): { path: string; body: string; count: number } {
  const cards = BUILTIN_SEED_CARDS.filter((card) => card.packId === entry.packId && card.type === entry.type);
  const cardless = CARDLESS_PACKS.map((pack) => `${pack.name}（\`${pack.id}\`）`).join("、");
  const lines = [
    `# 题库审查丨${entry.title}`,
    "",
    `- 来源：\`lib/game-packs/built-in-seeds/index.ts\`（packId \`${entry.packId}\` / type \`${entry.type}\`）`,
    `- 卡数：${cards.length}`,
    "- 尺度：强度 1–5，复用 Session 唯一尺度，无第二套尺度字段",
    `- 编号：按种子数组顺序，对应卡 id \`seed-${entry.packId}-${entry.type}-<编号>\``,
    `- 无题卡玩法（不产出题卡，仅备注）：${cardless}`,
    "",
    "| 编号 | 题面 | 强度 | 说明 | boundary |",
    "| --- | --- | --- | --- | --- |",
    ...cards.map((card, index) =>
      `| ${index + 1} | ${escapeCell(card.content)} | ${card.intensity} | ${escapeCell(card.instruction ?? "")} | ${boundaryCell(card.boundaryTags)} |`),
    "",
  ];
  return { path: join(OUTPUT_DIR, `${entry.file}.md`), body: `${lines.join("\n")}\n`, count: cards.length };
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  let total = 0;
  for (const entry of EXPORTS) {
    const { path, body, count } = renderEntry(entry);
    writeFileSync(path, body, "utf8");
    total += count;
    console.log(`[export:questions] ${entry.file}.md —— ${count} 卡`);
  }
  if (total !== EXPECTED_CARD_TOTAL) {
    throw new Error(`题卡总数异常：期望 ${EXPECTED_CARD_TOTAL}，实际 ${total}`);
  }
  console.log(`[export:questions] 完成：${EXPORTS.length} 个文件，合计 ${total} 卡；无题卡玩法 ${CARDLESS_PACKS.map((pack) => pack.name).join("、")}`);
}

main();
