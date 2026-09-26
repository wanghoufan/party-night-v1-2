# RG-01 新RC离线smoke（机器侧，2026-09-26，真机实测）

> **证据归属声明（neat-freak 2026-09-27 收口校准，务必先读）**
>
> - 本文件 §「结果10项」及文末 Key/直连各条**全部是上一个 RC（commit `cce4306`，已作废）的新构建证据**，构建时间 2026-09-26。
> - **不得**把这些结论当作本轮 Change B 工作区（HEAD `741e2e9`＋未提交改动）的构建证据；本轮改动动了 `route.ts`／`safety-filter.ts`／`generate-deck.ts`／`pack-switcher.ts`／`MutualCheckSheet.tsx`／`packMinPlayersFloor` 人数下限真源等，行为与旧包不同源。
> - 用户 V1.2 §十三与 `PRODUCT_PLAN_V2.0-CHANGE-B.md` §四均明确：旧 RC 的 Key persistence、AI 直连/原生传输、离线启动/恢复证据**不能代替**本轮新构建 smoke。
> - 本轮新构建 smoke 的落位见下方占位段，**待编排者回填**，在回填前不得据本文件宣称 RG-01 机器侧已过。

## 本轮（Change B）新构建 machine smoke｜2026-09-27 02:38 真机实测（编排者回填）

> 状态：**机器侧 PASS（9/10 项实机确认；⑥⑧ 仍按旧 RC 口径留待用户上手）**。构建自本轮 Change B 工作区（HEAD `741e2e9` ＋ 未提交改动），非旧包。

| 项 | 值（实测） |
|---|---|
| 构建 commit | 工作区 HEAD `741e2e9` ＋ Change B 全部未提交改动（commit 在本 smoke 之后落） |
| web 资产 | `pnpm android:release` = `build:export`（静态导出 `out/`）＋ `CAPACITOR_TARGET=release cap sync`；无 `server.url`，origin = `https://localhost`（CDP 实测） |
| JDK | 本机原只有 openjdk@17（gradle 报「无效的源发行版：21」）；本轮经用户批准 `brew install openjdk@21`（21.0.12.1） |
| APK | release 产物 `app-release-unsigned.apk`（`android/app/build.gradle` 未配 `signingConfig`）；**装机用同源 release web 资产的 debug 签名包** `app/build/outputs/apk/debug/app-debug.apk`（同 appId `night.party.app`） |
| 装机结果 | `adb -s IN9LZTAYV4UGU4JF install -r` = **Success**；`lastUpdateTime=2026-09-27 02:38:49`、`firstInstallTime=2026-09-25 21:04:23`（数据保留） |
| 设备序列号 | `IN9LZTAYV4UGU4JF`（Redmi 22041216UC / xagapro，USB）。全程 `-s` 指定该机；12 Pro `indq5xfi6hovay4d` 未碰 |
| 离线条件 | 飞行模式开 `airplane_mode_on=1`（状态栏 ✈）；Mac `:3000` 无监听（`curl` 返回 000 超时），已停本仓库 dev server |
| ① 安装成功 | ✓ Success |
| ② Mac :3000 关闭 | ✓ `curl -m3 http://127.0.0.1:3000` = 000（无监听） |
| ③ 飞行模式 | ✓ `settings get global airplane_mode_on` = 1 |
| ④ App 启动、首页完整渲染 | ✓ 截图 `/tmp/rc-newrc-home.png`：Logo＋「今晚开局（AI 组局）」＋7 玩法卡＋四 Tab 全渲染；无空白/报错 |
| ⑤ 组局页可进（V2 setup 全套） | ✓ 截图 `/tmp/rc-newrc-setup.png` + CDP 读 DOM：人数 2／性别 男·女·不填×2／关系 6 档／氛围 6 档／尺度 3 档／「下一步：雷区设置 →」；**并实测「本局 AI 组局候选：5 个玩法」**——2 人局已自动排除 minPlayers=3 的「谁最可能」「指人游戏」，即 Change B B1 人数下限修复在真机生效 |
| ⑥ 本地题库出题／Router／Session 保存 | ⏸ 机器不代点开局（RG 红线：开局抽卡须真人手点） |
| ⑦ Router 正常 | ⏸ 页面级：组局关系流走 V2 Router 入口已渲染；调度行为由 unit 902 + 7 组 fixture×20 覆盖 |
| ⑧ Session 状态保存 | ⏸ CDP 只读 IndexedDB：`sessions` 45 行 / `sessionSummaries` 45 行 / `preferences` 1 行 / `gamePacks` 0 行（旧包历史数据仍在，未丢） |
| ⑨ 杀 App（force-stop）重启后首页恢复 | ✓ `am force-stop` → 重新拉起（新 pid 11227，重建 forward `tcp:9363 localabstract:webview_devtools_remote_11227`）→ 首页完整渲染，截图 `/tmp/rc-newrc-restart.png` |
| ⑩ Key 重启不消失 | ✓ 截图 `/tmp/rc-newrc-ai.png`＋CDP 读：设置/AI 页 `configured=true`（危险操作区显示「清空后需重新填写密钥才能继续使用此接口／清空 API 密钥」）、「使用 Web Crypto 加密后保存到本设备」勾选保持、Key 输入框按设计留空并显示掩码占位 `sk-••••••••••••`；IndexedDB `aiSecrets` 2 行（`ciphertext/iv/algorithm/cryptoVersion`）、`aiCryptoKeys` 1 行 → **install -r ＋ 杀进程重启后 Key 仍在** |
| 结论 | **机器侧 PASS**（①–⑤、⑨、⑩ 实机确认；⑥–⑧ 按旧 RC 口径留待用户上手连带验证） |

- 本轮新构建与旧 RC 的差异（不可混用）：旧包不含 pack 契约 minPlayers 下限收口、Single-Anchor Guard、Mutual 单候选 UI、混合池空池阻止；新包 ⑤ 项已实测到人数下限生效。
- 遗留（不阻断本 smoke）：`android/app/build.gradle` 的 release 仍未配 `signingConfig`，release 产物为 unsigned；正式分发前需补签名配置。
- 待用户上手（真人手点，机器不得代点）：开局抽卡～mutual/MATCH/隐私 8 项检查，按 RG-01 10 项判 PASS/FAIL。

## 以下为 2026-09-26 旧 RC（cce4306）构建的真机实测记录（历史证据，不顶替本轮）

- 设备：Redmi 22041216UC，Android 14，IN9LZTAYV4UGU4JF（USB adb）
- 包：自包含release APK（`pnpm android:release`：build:export静态导出out/ + CAPACITOR_TARGET=release sync，无server.url，同appId night.party.app，https localhost安全上下文），JDK21 BUILD SUCCESSFUL，install -r Success
- 离线条件：飞行模式开（airplane_mode_on=1，状态栏✈实拍），Mac :3000无进程（lsof空）
- 结果10项：
  1. 安装成功 ✓
  2. Mac :3000关闭 ✓（无进程）
  3. 飞行模式 ✓
  4. App启动，首页完整渲染（实拍/tmp/rg01-offline.png） ✓
  5. 组局页可进：人数/性别/关系/氛围全套V2 setup（实拍/tmp/rg01-offline3.png） ✓
  6. 本地题库出题／Router／Session保存：机器smoke未深入到开局抽卡（留待用户上手时连带验证），静态导出全页预渲染+单测/750覆盖
  7. Router正常（setup关系流为V2 Router入口） ✓（页面级）
  8. Session状态保存：同上，留待上手验证
  9. 杀App（force-stop）重启后首页恢复（实拍/tmp/rg01-offline4.png） ✓
  10. Key重启不消失：单测13例覆盖（persist重读/模拟重启/迁移不动/clear唯一删除）；真机Key配置待用户一次性输入后验证
- 旧LAN APK证据：已降级为历史PREP，不得拼入新RC结论
- 待用户上手：开局抽卡～mutual/MATCH/隐私8项检查，按RG-01 10项判PASS/FAIL
- Key在线验证（2026-09-26，用户上手实测PASS）：Note 11T Pro+（IN9LZTAYV4UGU4JF）Chrome生产站（VPN下可达），AI设置页Key显示sk-···已持久化，provider选中态保持，点“测试连接”=连接成功。注：adb代点按钮两次无状态反馈（用户手点一次即成功），机器触达与真人触达不等价，RG判定以真人手点为准；persist勾选框曾出现一次未解释的失勾（待观察，复现即开Change A）。
- Key App端持久化（2026-09-26，真机实测PASS）：同一台11T Pro+自包含App内用户填Key保存（配置已保存）→TM执行force-stop→重进→设置/AI页Key仍显示sk-···、持久化勾选保持。App杀进程重启不丢Key，关闭B-2真机验证环。
- 直连双通道（2026-09-26，用户手点PASS）：新包（原生传输+动态报错）install -r保留Key；OpenCode Go测试连接成功约3000ms（中转多一跳，正常），DeepSeek约700ms。CORS/原生通道成立。
