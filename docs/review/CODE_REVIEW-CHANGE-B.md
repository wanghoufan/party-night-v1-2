# CODE REVIEW

- Task: Change B 复核（B-1 自包含 Release 构建链 ＋ B-2 Key 持久化边界 ＋ AI-MATRIX-PLAN ＋ eslint 忽略项）
- Commit: 工作区未提交变更（基线 16cc346；涉及 capacitor.config.{dev,release}.ts、scripts/build-{static-export,android-release}.mjs、next.config.ts、app/{layout,generating,settings/ai}、lib/storage/ai-provider-repository.ts、tests/unit/ai-key-persistence.test.ts、eslint.config.mjs、docs/qa/AI-MATRIX-PLAN.md）
- Reviewer: code-reviewer
- Result: **过（PASS）**。P0 = 0，P1 = 0；P2 三条不阻断，见下。

## 逐项核验证据

### B-1 自包含 Release

- **release 无 server.url**：`capacitor.config.release.ts` 只含 appId/appName/webDir='out'，无 server 字段；实测 `android/app/src/main/assets/capacitor.config.json` 当前即 release 形态（`{"appId":"night.party.app","appName":"PartyNight","webDir":"out"}`），cap sync 落地证据成立。
- **同 appId**：dev/release 两份均为 `night.party.app`，换配置不丢 IndexedDB（含已存 Key）。
- **https localhost 安全上下文**：release 未设 androidScheme → Capacitor 默认 https，源 `https://localhost` 是安全上下文，`crypto.subtle` 可用，AES-GCM 加密落盘可行。dev 配置显式 `androidScheme:'http'` + cleartext，并在注释里如实声明「仅本次会话」的限制，口径一致。
- **构建脚本**：`scripts/build-static-export.mjs` 暂移 `app/api` → `PARTY_NIGHT_OUTPUT=export` 跑 `next build --webpack` → finally + SIGINT/SIGTERM/SIGHUP 三信号兜底放回；启动时先 restore 再 stash，可从异常退出恢复。实测当前 `app/api/`（generate-session、test-provider）在位、`.static-export-stash` 不存在（放回机制实际工作过）、`out/index.html` 存在（导出真跑通过）。`build-android-release.mjs` 串 build:export → 校验 out/index.html → `cap sync android`（CAPACITOR_TARGET=release），Windows/macOS 双平台 shell 处理正确，无机器绝对路径。
- **next.config.ts export 模式**：开关仅在 `PARTY_NIGHT_OUTPUT=export` 时生效（output:'export' + trailingSlash + images.unoptimized），默认走 standalone，生产 PWA/局域网行为未动；导出模式 headers 不可注入，改由 `app/layout.tsx:30` meta http-equiv 兜同一套 CSP（meta 不支持 frame-ancestors 已正确去掉），且仅 isSelfContained 时注入，不与服务器头重复下发。
- **api 缺席有 fallback、不断游**：两处 /api 调用全部有闸——generating 页 `selfContained` 直接置 `offline` 态，不发注定失败的请求，「使用本地题库开始」可达（`app/generating/page.tsx:50`）；settings/ai 测试连接同样短路并说明原因（`app/settings/ai/page.tsx:57`）。局内 `refillPackInBackground` 自身 try/catch 永不抛错，自包含版即使带 Key 也只是静默原样返回，游程不断。`NEXT_PUBLIC_SELF_CONTAINED` 构建期内联，服务器模式为空串不误伤。
- **settings/ai 自包含提示**：`provider-note` 明示「完全离线、不带服务器代理、Key 仍加密存本机」，与实际行为相符。

### B-2 Key 持久化边界

- **persistent-failed 强提醒**：`ai-provider-repository.ts:49-54` 持久化失败退会话内存但回报第三态，不静默；settings 页对该态单独文案（明示「重启APP会丢失」），与 session-only 文案区分。
- **clearSecret 唯一生产调用**：全仓 grep，生产代码仅 `app/settings/ai/page.tsx:91` 一处（其余命中均为测试文件），且调用后做 `hasSecret` 反验，失败走 `clear-secret-state` reducer 的 failure 态。
- **ai-key-persistence.test.ts 13 例**：实跑 `pnpm vitest run` → **13/13 通过（32ms）**。覆盖：persist=true 落密文重读、persist=false 不落库、resetDbForTests+resetModules 模拟重启（含 session-only 反向对照）、saveProfile/ensurePresets/listProfiles 不碰 secret、多 Provider 互不串、Session 增删迁移 reconcile 全程密钥逐字节不变、仅 clearSecret 删（aiCryptoKeys 保留）、clearSecret 清会话态兜底、脱敏函数/导出形状/源码扫描三层防明文泄露。断言密文记录键集合、Buffer 级密文不等、源码正则禁 console 打印，覆盖扎实。

### AI-MATRIX-PLAN.md 合理性

- **格数数学全对**：2.1=7×3=21、2.2=7×2×2=28、2.3=7×2=14、2.4=10×3=30、2.5=3×3=9、2.6=7×2=14、2.7=7×1=7，小计 123 ✓；总 ≈52+123+20≈195 ✓；pairwise 理论下界 max(7×6)=42 ✓。
- **方法论正确**：风险优先分层优于旧均匀轮换（`i%5`/`i%6` 只保单因子分布，不保成对覆盖）；2.6/2.7 强制成对对照组防止「模型本来就不写身体接触」的假阳性；2.4 单雷区隔离归因；§5 红线双档判定（小句切分 + 否定/免责语境豁免 + 反向真违规对照）与既往误杀教训一致。
- **凭据与真机口径符合已知事实**：禁止碰产品 IndexedDB、禁止整页重载（会话级 Key 承受不了文档级导航）、真机只跑第二层高风险子集——与真机 WebView 实测坑位（origin 隔离、生成超时）吻合。§9 明示 PLAN 设计值须在 RESULT 回填实数，诚实。

### eslint.config.mjs 忽略项

- `android/**/build/**`（gradle 产物）、`android/app/src/main/assets/**`（cap sync 拷入的 web 产物 + 生成的 capacitor.config.json）、`out/**`（静态导出产物）——三者均为生成物，`.gitignore` 已覆盖 out/ 与 .static-export-stash/，忽略恰当且范围收敛，未放宽业务代码检查。

## P0 / P1 Findings

- 无。

## P2 / P3 Backlog Findings

- **P2｜persistent-failed 文案残缺**（`app/settings/ai/page.tsx:79`）：「请重试或联系」句子未写完（联系谁？）。关键信息（重启即丢）已传达，不阻断，但建议补全为「请重试或联系支持」或直接删去后半句。
- **P2｜restoreApi 启动路径存在理论覆盖窗口**（`scripts/build-static-export.mjs:25`）：若 crash 后 stash 与 `app/api` 同时在位（如用户手工 `git restore app/api` 后再跑脚本），启动 restore 会 rmSync 现有 apiDir 再 rename 进 stash——stashed 与 HEAD 内容通常一致故无害，但若用户在 stash 期间改过 app/api 会丢改动。概率极低，可加一行「两边都在位时 diff 提示」兜底，不强制。
- **P3｜AI-MATRIX-PLAN §7 真机分片截图目录**（`test-results/phone/ai-matrix/`）：test-results 已被 eslint/gitignore 惯例忽略，注意 RESULT 落盘时截图属临时证据，别把复现所需原文只留在截图里（逐格 JSON 已覆盖，仅提醒执行时保持）。

---

## 附录｜增量补审：packs 编辑器系（上轮漏审，2026-09-26）

- Task: Change B 主审 PASS 后补审上轮漏审的 packs 编辑器系路由搬家
- 范围: `app/packs/page.tsx`、`app/packs/rules/[ruleId]/page.tsx`、`app/packs/editor/`、`app/packs/new/`、`components/packs/PackEditor.tsx`（由 `app/packs/[packId]/page.tsx` 搬家，git rename 相似度 91%）、`components/packs/RuleDetailView.tsx`、`app/generating/page.tsx`、`app/layout.tsx`、`app/manifest.ts`、`capacitor.config.ts`、`next.config.ts`、`package.json`
- Reviewer: code-reviewer（增量）
- Result: **过（PASS）**。P0 = 0，P1 = 0。

### 四项确认

1. **搬家语义不变 ✓**：rename diff 仅三处实质改动——`useParams().packId` → `useSearchParams().get("id") ?? "new"`（id 改走查询参数，动因成立：自定义包 id 运行期生成，静态导出无法预渲染动态路由）、default export → named export、补注释。sanitize/校验/保存/重定向逻辑逐行未动；动态路由缺席时跳 `/packs` 的行为在 `id≠new` 且包不存在时原样保留（PackEditor.tsx:39）。
2. **旧路由无残留死链 ✓**：全仓 grep `packs/\$\{`、`packs/\[packId\]`、`/packs/<literal>`——业务代码仅剩 `/packs/editor?id=` 与 `/packs/rules/${entry.id}` 两类链接；`public/sw.js` 无 packs 路由引用；e2e `custom-pack-regression.spec.ts` 已同步改为断言 `/packs/editor?id=custom-`。
3. **新 editor/new 路由正常 ✓**：两入口均为静态路由，`useSearchParams` 均被 Suspense 包裹（静态导出 CSR 兜底要求满足）；rules/[ruleId] 用 `generateStaticParams` + `dynamicParams=false` 全目录预渲染，与 output: export 兼容。实测 `pnpm typecheck` 0 错，packs 相关 4 个单测文件 25/25 通过。
4. **Change B 局部改动、无产品语义变更 ✓**：其余文件全部由构建期开关闸住——generating 页 offline 短路仅在 `NEXT_PUBLIC_SELF_CONTAINED=1`（export 构建内联）；layout meta CSP 仅 `PARTY_NIGHT_OUTPUT=export` 时注入且去 frame-ancestors（meta 限制，注释如实）；manifest 仅加 `force-static`；capacitor 入口按 `CAPACITOR_TARGET` 分流、未设时默认 dev＝历史行为；next.config 未设 export 变量时 standalone+headers 与原样逐字节一致。服务器模式（生产 PWA）行为零变化。

### P2 / P3 Backlog Findings（均不阻断）

- **P2｜`app/packs/[packId]/` 空目录残留**：路由文件已 git RM，但磁盘上留了空目录（untracked）。对 Next 无路由影响，但易误导后续排查，建议 `rmdir 'app/packs/[packId]'` 清掉。
- **P3｜`/packs/editor` 裸访问语义微差**：不带 `?id=` 时静默当「新建」编辑器（`?? "new"`），而旧动态路由必须有 id 才能进入。属搬家固有差异，用户正常路径（/packs 列表点入必带 id）不受影响，仅记录不要求改。
- **P3｜`blankPack()` 仍走 `enabledByDefault: true`**：与搬家前一致，未变化；仅提示该字段语义由 R-054/R-055 开关链统一管理，后续若改默认值需同步 packs 页开关逻辑。
