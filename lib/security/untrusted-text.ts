/**
 * 不可信文本的安全边界（T197 / FR-042）：
 * AI 输出、自定义题卡、玩家昵称、规则正文都当作纯文本；渲染交给 React 默认转义（禁原始 HTML 注入），
 * 入口处只做两件事——去掉控制字符、按契约钳制长度，避免撑爆 UI 或带进日志/存储里捣乱。
 * 长度上限与 lib/domain/schemas、lib/rules/types 的 zod 上限保持一致。
 */
export const UNTRUSTED_TEXT_LIMITS = {
  cardContent: 500,
  cardInstruction: 300,
  playerName: 30,
  ruleSummary: 120,
  ruleStep: 200,
} as const;

/** 去掉 C0/C1 控制字符与零宽字符（含 \u0000-\u001F、\u007F-\u009F、\u200B-\u200F、\uFEFF），保留常规空白由调用方 trim。 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

export function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

/** 去控制字符 → 去首尾空白 → 钳制长度。不做 HTML 相关处理：内容始终按纯文本交给 React 渲染。 */
export function sanitizeUntrustedText(value: string, maxLength: number): string {
  return clampText(stripControlChars(value).trim(), maxLength);
}

/** 玩家昵称：空/纯空白回退到占位名，超长按昵称上限截断。 */
export function sanitizePlayerName(value: string, fallback: string): string {
  return sanitizeUntrustedText(value, UNTRUSTED_TEXT_LIMITS.playerName) || fallback;
}
