const SECRET_KEYS = /^(authorization|api[-_]?key|token|secret)$/i;
const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\-/=]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(api[_-]?key["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
];

export function redactText(value: string): string {
  return TOKEN_PATTERNS.reduce((text, pattern) => text.replace(pattern, (_, prefix?: string) => prefix ? `${prefix}[REDACTED]` : "[REDACTED]"), value);
}

export function redactUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : redactUnknown(item, seen)]));
}

export function safeErrorMessage(error: unknown): string {
  return redactText(error instanceof Error ? error.message : "请求失败");
}
