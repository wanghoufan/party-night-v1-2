# AI-GEN-DIAG-0926｜Mac OpenCode 分块生成根因对照

- 日期：2026-09-26
- 目的：用 Mac 侧同一 `generateDeckDirect` 分块逻辑直打 OpenCode Go，检查修复后强度 5 长卡面场景是否仍出现 `maxTokens` 截断。
- 场景：`spin-bottle` / 强度 5 / 4 人 / 目标 40 卡；使用 `OPENCODE_GO_PROFILE`（运行时展开 `enabled: true`）、OpenCode Go 凭据及四批 sequential 请求。
- 配置：关系「刚认识」、氛围「随机」、默认边界、`mode=single`；每批 10 卡，单批 45 秒，失败间隔 1 秒重试 1 次。
- 凭据：从 `~/.local/share/opencode/auth.json` 读入进程内存；未打印、未写入工作区或诊断文档。
- 执行：`npx vite-node -c vitest.config.ts tests/tmp-diag-spin.ts`；脚本随后删除。

## 本次真实输出

```text
batch 1/4 cards=0 err=provider-network-error
batch 2/4 cards=0 err=provider-network-error
batch 3/4 cards=0 err=provider-network-error
batch 4/4 cards=0 err=provider-network-error
THROWN provider-network-error totalMs=4024
```

## 结论

本次 Mac 对照未触发 JSON 解析，也没有复现 `Unterminated string in JSON`；4 批均以 `provider-network-error` 结束，最终没有返回卡牌。该输出归类为本次 OpenCode 网络错误，不能作为 maxTokens 截断已在真实请求中消除的证明。`generateDeckDirect` 已把每批上限修复为 `Math.max(8192, batchCardCount * 640)`，并增加批失败后间隔 1 秒重试 1 次；818 项单测（含 maxTokens 截断重试新例）全通过。

编排者记录的修复前首跑历史输出：`Unterminated string in JSON at position 2025/394`（编排者 2026-09-26 首跑）。设备终证已闭环：修复包于 2026-09-26 19:18 装机，`spin-bottle / i5 / p4` 真机复跑 PASS（148775ms），合法格真机矩阵 24/24；详见 [`AI-MATRIX-PHONE.md`](AI-MATRIX-PHONE.md)。
