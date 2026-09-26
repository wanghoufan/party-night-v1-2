# CODE REVIEW

- Task: public/sw.js 离线导航缓存修复复核（导航文档纳入离线缓存）
- Commit: 未提交（工作区 diff，public/sw.js 55cf55b → 12493b1）
- Reviewer: code-reviewer
- Result: 过（PASS，无 P0/P1）

## 复核口径逐项结论

### 1) 导航是否仍网络优先（在线不拿旧 HTML）——是

- `public/sw.js:37`：fetch handler 恒先 `fetch(request)`，只有网络失败（catch）才读 cache。在线永远拿最新 HTML，cache 里的导航副本只在每次成功响应后被动刷新（`public/sw.js:38-41`），不存在"在线读旧缓存"路径。
- 语义核实：这是"网络优先 + 按 URL 留离线副本"，非 stale-while-revalidate；注释（`public/sw.js:5,19`）与实现一致。

### 2) AI/导出/密钥路径是否仍永不缓存——是

- `public/sw.js:36`：`/api/`、`/export/`、`/backup/` 在 respondWith 之前 early-return，SW 完全不介入、不可能落盘（顶层导航下载同样被拦）。
- `forbidsCache`（`public/sw.js:18`）保留 no-store/private 拦截，改动只是去掉 `request.mode === "navigate"` 这一条件——而 navigate 恰是本次要缓存的主体，去掉是修复意图本身，不是漏洞。
- 注意点已验证：HTML 若带 `no-store/private` 会被 forbidsCache 拦掉导致导航缓存静默失效。实测线上 `https://party-night-v1-2.vercel.app/` 与 `/game` 均返回 `cache-control: public, max-age=0, must-revalidate`，导航缓存可真实生效。

### 3) 旧版本清理逻辑是否 intact——是

- activate（`public/sw.js:29-31`）与改前逐字节一致：清掉所有 ≠ CACHE_NAME 的 cache 后 clients.claim。未受本次改动影响。

### 4) tests/unit/service-worker-cache.test.ts 口径是否真无冲突——无冲突，实测通过

- 本地实跑 `npx vitest run tests/unit/service-worker-cache.test.ts`：4/4 通过。
- 关键兼容点：旧测试唯一涉及导航的断言是"离线导航回落外壳返回 200"（test :121），新回退链"先同路径 → 再外壳"（`public/sw.js:43`）是其超集，断言仍成立；测试文件中没有"导航不落盘"的旧断言，与本次改动不冲突。
- 测试覆盖缺口（不算缺陷）：无"在线导航成功后按 URL 落盘、二次在线不读缓存"的正向断言，本复核以代码走读+线上 header 实测补位。

### 5) CACHE_VERSION 未动是否合理——合理（记一条 P2）

- 本次是**首次引入**导航缓存：旧 cache `party-night-shell-v1.5.0` 里不存在任何旧导航 HTML 可被读到（旧版从不缓存导航），静态资源带内容 hash，无陈旧 HTML 风险；版本三处（package.json / sw.js / version.json）仍一致为 1.5.0，符合用户立规。
- P2：按 `public/sw.js:6` 自身注释"改缓存名单时同步改 CACHE_VERSION"，本次名单实质扩了（导航文档），严格按字面应 bump 一次。不 bump 无正确性风险，但同版本号跨多次部署时，孤儿 hash chunk 会留在旧 cache 里累积（activate 只在 CACHE_NAME 变化时清理）。建议下次改名单或发版时一并 bump。

## P0 / P1 Findings

- 无。

## P2 / P3 Backlog Findings

- P2：CACHE_VERSION 未随缓存名单扩充而 bump（理由与建议见上）。
- P2：测试缺"导航成功落盘"正向断言，后续可补一条 `mode:"navigate"` 200 响应应写入 cache 的用例。
