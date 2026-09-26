# AI-MATRIX-PHONE｜真机（11T Pro+）AI 组局全矩阵实测

---

## 真机复跑 · 2026-09-26（11T Pro+ / 11t）

- 设备：11t · adb `IN9LZTAYV4UGU4JF` · 机型 22041216UC（11T Pro+ / xagapro）
- 通道：WebView CDP（Playwright `connectOverCDP` tcp:9363）→ APP origin `https://localhost`（运行时记录，自包含包 WebView 本地 origin）
- 链路口径：自包含 APK（NEXT_PUBLIC_SELF_CONTAINED=1）→ direct/native transport（CapacitorHttp → Provider `chat/completions`）；Mac :3000 不作为真机业务依赖（自包含包无 /api 代理，生成走前端直连；:3000 仅 Mac 侧矩阵 harness 使用）
- 证据格：自包含包 + 实际 origin + generationSource=ai（见明细行/截图）
- Provider：`opencode-go` / model=`deepseek-v4.1-flash`（activeProviderId=opencode-go）
- 鉴权：**手机 APP 内已配置的真实 API Key**（harness 全程不读、不打印、不落盘密钥）
- 矩阵：7 玩法 × 强度 {2,5} × 人数 {2,4} = 28 组，其中合法 24 组（players < pack.minPlayers 的格不生成，AI-MATRIX-PLAN §1 同口径）；每个合法格截图 1 张；相邻调用间隔 ≥ 3s
- 每组流程：首页玩法卡 → 组局(人数/强度) → 雷区 → 生成游戏(AI) → 等出卡 → 断言可玩 → 截图 → 应用内收局
- 判定：视图可玩 且 该玩法有卡 且 Session `generationSource === "ai"`（只有 `ai` 算 AI PASS；静默回退本地题库不算）
- 整页重载：**0 次**（会话级内存 Key 不能承受任何文档级导航；harness 只走 APP 客户端路由）

### 通过率：1/24 = **4.2%**（分母＝合法格数，AI-MATRIX-PLAN §1 同口径）（当前仅覆盖 1/24 合法格）；SKIPPED-ILLEGAL 4 格（不计入 PASS/FAIL 与分母）

- 出卡耗时（点「生成游戏」→ 视图可见）：最小 102447ms / 中位 102447ms / 平均 102447ms / 最大 102447ms

### 组合明细

| 玩法 | 强度 | 人数 | 结果 | 卡数(该玩法/其中AI) | 来源 | 当前卡玩法 | 卡片强度 | 耗时(ms) | 失败原因 | 截图 |
|---|---|---|---|---|---|---|---|---|---|---|
| 真心话大冒险 `truth-dare` | 2 | 2 人 | ✅ 通过 | 40 / 39 | ai | truth-dare | 2 | 102447 |  | truth-dare__i2__p2.png |
| 谁最可能 `most-likely` | 2 | 2 人 | ⏭ SKIPPED-ILLEGAL | ? / ? | 缺失 | — | — | — | SKIPPED-ILLEGAL（人数低于玩法 minPlayers：most-likely minPlayers=3 > 2） | — |
| 谁最可能 `most-likely` | 5 | 2 人 | ⏭ SKIPPED-ILLEGAL | ? / ? | 缺失 | — | — | — | SKIPPED-ILLEGAL（人数低于玩法 minPlayers：most-likely minPlayers=3 > 2） | — |
| 指人游戏 `pointing-game` | 2 | 2 人 | ⏭ SKIPPED-ILLEGAL | ? / ? | 缺失 | — | — | — | SKIPPED-ILLEGAL（人数低于玩法 minPlayers：pointing-game minPlayers=3 > 2） | — |
| 指人游戏 `pointing-game` | 5 | 2 人 | ⏭ SKIPPED-ILLEGAL | ? / ? | 缺失 | — | — | — | SKIPPED-ILLEGAL（人数低于玩法 minPlayers：pointing-game minPlayers=3 > 2） | — |

### 失败清单

（无失败组）

### 截图目录

`test-results/phone/ai-matrix/`（每个合法格 1 张，文件名 `<packId>__i<强度>__p<人数>.png`）
注：`pointing-game__i2__p2.png` 是首轮按旧口径执行该非法格留下的截图，保留为历史证据，不计入本次矩阵截图。
