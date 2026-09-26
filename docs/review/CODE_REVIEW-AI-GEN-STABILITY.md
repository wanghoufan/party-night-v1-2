# CODE REVIEW｜AI 前端直连 + 整局分块生成 + 回退提示（工作区未提交全量，HEAD 741e2e9）

- Task：AI 前端直连（CapacitorHttp 直连 Provider，绕自包含包无 /api 代理）＋整局分块生成（4 批×10、单批 45s、任一批成功并入、全部失败才回退）＋回退提示＋generationSource 判定＋tests 两矩阵 harness 改造
- Commit：工作区未提交（HEAD=741e2e9；改动 21 文件 + 67 个 docs/qa/ai-content/ 留存 JSON 未跟踪；lib/ai/direct-provider.ts、lib/domain/generation-source.ts、tests/unit/direct-provider*.test.ts、tests/unit/generation-source.test.ts 为新文件，已全读）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**过**（P0=0；P1=1，为 harness 口径不阻塞业务代码，随真机验证前修正）

> 证据：`git status --porcelain` 全量核对无漏读；相关单测实跑 4 文件 72/72 绿（direct-provider 30、direct-provider-native 14、generation-source 15、provider-errors 13，2026-09-26 本机 vitest）；lint/typecheck 由派工方报 0 error，本次复核逻辑正确性。

## 七查结论（逐条）

1. **DEV_BASELINE 一致**：PRODUCT_PLAN_V2.0（Change A/B/C 均在 V2.0 框架内，HANDOFF 口径一致）。
2. **Requirement 覆盖**：三处调用方（设置测试连接 `testDirectConnection`、整局生成 `requestDeckDirect`、局内补题 `refillPackInBackground`→`resolveDeckTransport`）全落 `directChatCompletion` 单实现，无双实现（lib/ai/direct-provider.ts:216，lib/ai/generate-deck.ts:101）。
3. **DoD 达成**：分块/超时分离/回退提示/generationSource 均有单测；仅真机验证（HANDOFF 前置 P0）未做，与本评审无关。
4. **Diff 越界**：无。schemas/session-engine 改动最小（可选字段，旧行为不变）；next-env.d.ts 为 next dev 自动生成（.next/types→.next/dev/types），非人为越界。
5. **回归影响**：服务器模式路径未动（仍只走 /api，tests/unit/direct-provider.test.ts:162-170 有守护）；providerErrorMessage 默认参保持 DeepSeek 文案（tests/unit/provider-errors.test.ts:12-16 有守护）。
6. **分级**：见下。
7. **可回滚性**：单 commit 可整体 revert；schema 新增字段均为 optional，旧记录兼容。

## 安全红线核验（重点 1，全部 PASS）

- **Key 只进 Authorization 头**：fetch 路径（lib/ai/direct-provider.ts:220-252）与原生路径（:183-199）均如此；单测断言 Key 不进 URL/正文/错误信息（tests/unit/direct-provider.test.ts:54-87、tests/unit/direct-provider-native.test.ts:61-82）。
- **https 公网校验**：`resolveDirectEndpoint` 拒非 https、URL 内凭据、localhost/.local/.internal/metadata、私网 v4（0/10/127/100.64/169.254/172.16/192.168/198.18/203.0/≥224）与 v6（::/::1/ULA/link-local/组播/2001:db8/映射 v4）（lib/ai/direct-provider.ts:99-141）。浏览器侧只能做字面量判定，DNS 级校验做不到，已在注释声明并以 https+redirect:"error" 兜底——口径合理。
- **禁跨主机重定向**：fetch `redirect:"error"`（:248）；原生 `disableRedirects:true` + 3xx 判失败 + `assertNativeRedirectSafe` 同源校验（:87-92, :206-207）双保险；单测覆盖跨主机→URL_REJECTED（direct-provider-native.test.ts:109-126）。
- **CSP**：自包含 connect-src 从 `'self'` 放宽为 `'self' https:`（app/layout.tsx:31），主机级约束交由 JS 校验；见 P3-2。
- **落盘**：generationFallback 只存 providerName+code+at（lib/domain/schemas.ts:171-182），单测断言序列化不含 sk-/Bearer/Authorization（generation-source.test.ts:130-146）。

## P0 / P1 Findings

- **P0：无。**
- **P1-1｜真机矩阵 harness 生成等待 120s < 应用最坏 180s，慢成功会被误判失败**（tests/phone/ai-matrix-phone.ts:77 `GEN_TIMEOUT_MS = 120_000`）。分块 4 批 sequential 单批 45s，最坏 180s+；若某格各批都慢（如 35s×4=140s），应用最终能成功开局，但 harness 在 120s 已判 timeout→FAIL，产出错误的 AI PASS/FAIL 证据——恰好污染本改动要闭环的前置 P0（真机 AI 生成验证）。**改法**：GEN_TIMEOUT_MS 提到 ≥190_000（或轮询时读生成页「第 x/y 批」进度，有推进就续等）。

## P2 / P3 Backlog Findings

- **P2-1｜partialCode 仅在调用方传 onProgress 时才被捕获**（lib/ai/generate-deck.ts:138-143）：局内后台补题（refillPackInBackground 不传 onProgress）部分批次失败完全不可见。补题本就是尽力而为的静默增强（既有设计），记 backlog：若后续要给补题失败加提示，需把 lastError 通道补进 refill 链，而不是复用 onProgress 侧带。
- **P3-1｜game 页 fallback 提示的 ref 不随 session.id 重置**（app/game/page.tsx:60-62）：同组件实例内切换到另一局时 `fallbackAnnounced`/`previousGenerationSource` 残留，新一局的 local-fallback 提示可能被吞。影响仅提示不提示，不影响玩法。改法：useEffect 里检测 session.id 变化时重置两个 ref。
- **P3-2｜自包含 CSP connect-src `https:` 为全域放行**（app/layout.tsx:31）：主机白名单只在 JS 层（direct-provider），脚本被注入时可外传任意 https 端点。本地单机 App 可接受，注释已写明动机；后续可收紧为官方两 preset 域名 + 自定义域名动态清单。
- **P3-3｜fetch 路径跨主机重定向报 NETWORK_ERROR，原生路径报 URL_REJECTED**（lib/ai/direct-provider.ts:256-258 vs :206）：`redirect:"error"` 抛 TypeError 被归一为 provider-network-error。仅文案口径差异（都判失败、都不带走 Key），统一与否不影响安全。
- **P3-4｜手机 probe 命令从只读变为会点 UI 导航**（tests/phone/ai-matrix-phone.ts:605-620 新增 keyReadyViaUI 调用），但用法注释仍写「只读探测」。仅客户端路由、无整页重载，无实害；建议同步注释口径。
- **P3-5｜generateSelfContained 的 catch 走 `providerErrorMessage(error.message)`**（app/generating/page.tsx:88-90）：该 catch 实际几乎不可达（requestDeckWithFallbackResult 内部已兜底），若因存储异常触发会显示「AI 服务暂时不可用」，轻微误导。可接受，不改。

## 分块语义与下游安全核验（重点 2）

- 逐批独立 45s（`timeoutMs: DECK_BATCH_TIMEOUT_MS`，direct-provider.ts:325）；失败批记 `batchErrors` 继续；`cards.length===0` 才抛（:337）；部分成功并入的原始卡经 `buildPlayableDeck` 统一 schema 校验→安全过滤→enabledPack 过滤→**按 id/题面去重**→round-robin 取牌，并用本地卡补足 targetCount（lib/ai/generate-deck.ts:39-63），跨批重复与 cards<target 均被下游吸收；`deck.length<10` 才整体落本地。口径一致，无下游风险。
- generationSource 判定唯一实现在 lib/domain/generation-source.ts:13（Session 落库 session-engine.ts:44/:56、/api 响应 route.ts:48、game 页补题重算 game/page.tsx:99、Mac/Phone harness 全部复用，无双实现）；「只有 ai 算 AI PASS」在两 harness 的 screenCards/runCell 判定中均已落（ai-matrix-full.ts screenCards 新增 generation-source violation；ai-matrix-phone.ts:565-566 新增非 ai 即 FAIL），且未改 docEpoch 纪律与既有判定语义——符合「只改 harness 口径不改判定语义」。
- 静默回退不掩盖：全失败→fallbackCode 写入 session.generationFallback→game 页一次性提示（含原因）；部分失败→partialCode 同样落库（generationSource 仍 ai 不弹「已切换」提示，注释已声明该取舍，合理）；本就纯本地→中性文案不谎报 AI 失败（generation-source.ts:40-51）。

## 超时口径与资源清理（重点 5）

- `withDirectTimeout`（direct-provider.ts:60-76）：timer 在 finally 清理、abort 监听 once+finally 移除、无泄漏；原生底层请求超时后不可取消属 Capacitor 限制，竞速丢弃结果已被 Promise.race 挂接 handler，无 unhandled rejection。fetch 路径 controller.abort() 真取消请求（:240-257）。15s（DIRECT_TIMEOUT_MS）与 45s（DECK_BATCH_TIMEOUT_MS）分离有常量级单测守护（direct-provider.test.ts:251-255）。

## 复核证据

- 实跑：`npx vitest run` 4 个相关测试文件 72/72 PASS（direct-provider 30 / direct-provider-native 14 / generation-source 15 / provider-errors 13）。
- `git status --porcelain` 逐条核对：21 个改动文件 + 4 个新代码/测试文件 + docs/qa/ai-content/ 67 个未跟踪留存 JSON + ai-content→ai-content-deepseek-0926 重命名，无漏读；未读密钥值（.env.local、auth.json 未触碰）。
