#!/usr/bin/env node
// check-ledger.mjs — 账本合法性校验（TASK-MODEL-LOG / DISPATCH-LOG）。
// Usage: node check-ledger.mjs [dir] -> exit 0 合法 / exit 1 列出问题
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "docs/model";
const fails = [];
function check(file, need, enums) {
  const p = join(dir, file);
  if (!existsSync(p)) { fails.push(`${file}: MISSING`); return; }
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  let n = 0;
  for (const [i, l] of lines.entries()) {
    let d;
    try { d = JSON.parse(l); } catch { fails.push(`${file}#${i + 1}: BAD_JSON`); continue; }
    if (d._example) continue;
    n++;
    for (const k of need) if (!(k in d)) fails.push(`${file}#${i + 1}: missing ${k}`);
    for (const [k, vs] of Object.entries(enums)) {
      if (k in d && d[k] !== null && !vs.includes(d[k])) fails.push(`${file}#${i + 1}: bad ${k}=${d[k]}`);
    }
  }
  if (n === 0) fails.push(`${file}: only _example rows (首个真实任务前删除示例行)`);
  const nex = lines.filter((l) => { try { return JSON.parse(l)._example === true; } catch { return false; } }).length;
  if (n > 0 && nex > 0) fails.push(`${file}: ${nex} _example rows mixed with ${n} real rows (示例行必须在首个真实任务前删除)`);
}
check("TASK-MODEL-LOG.jsonl",
  ["task", "project", "date", "role", "model", "result", "rework", "escalated", "escalation_reason", "tokens", "cost_cny"],
  { result: ["PASS", "FAIL"], escalated: ["YES", "NO"] });
check("DISPATCH-LOG.jsonl",
  ["date", "task", "role", "model", "used", "runtime", "result"],
  { result: ["PASS", "FAIL"] });
if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
console.log("LEDGER-OK");
