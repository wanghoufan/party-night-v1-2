# AI-MATRIX-PHONE｜真机（Note 12 Pro）AI 组局全矩阵实测

---

## 真机复跑 · 2026-09-26（Note 12 Pro / dev31）

- 设备：dev31 · adb `192.168.31.31:5555` · android_id `4ab185ebe26feae1` · 机型 22101316C（Note 12 Pro）
- 通道：WebView CDP（Playwright `connectOverCDP` tcp:9331）→ APP origin `http://192.168.31.60:3000`
- Provider：`deepseek-official` / model=`deepseek-flash`
- 鉴权：**手机 APP 内已配置的真实 API Key**（harness 全程不读、不打印、不落盘密钥）
- 矩阵：7 玩法 × 强度 {2,5} × 人数 {2,4} = 28 组；每组截图 1 张；相邻调用间隔 ≥ 3s
- 每组流程：首页玩法卡 → 组局(人数/强度) → 雷区 → 生成游戏(AI) → 等出卡 → 断言可玩 → 截图 → 应用内收局
- 整页重载：**0 次**（会话级内存 Key 不能承受任何文档级导航；harness 只走 APP 客户端路由）

### 通过率：5/28 = **17.9%**（当前仅覆盖 8/28 格）

- 出卡耗时（点「生成游戏」→ 视图可见）：最小 38408ms / 中位 42462ms / 平均 43605ms / 最大 51210ms

### 组合明细

| 玩法 | 强度 | 人数 | 结果 | 卡数(该玩法/其中AI) | 当前卡玩法 | 卡片强度 | 耗时(ms) | 失败原因 | 截图 |
|---|---|---|---|---|---|---|---|---|---|
| 真心话大冒险 `truth-dare` | 2 | 2 人 | ✅ 通过 | 40 / 40 | truth-dare | 2 | 41052 |  | truth-dare__i2__p2.png |
| 真心话大冒险 `truth-dare` | 2 | 4 人 | ✅ 通过 | 40 / 40 | truth-dare | 2 | 38408 |  | truth-dare__i2__p4.png |
| 真心话大冒险 `truth-dare` | 5 | 2 人 | ❌ 失败 | ? / ? | — | — | — | AI 生成失败：这次生成没有完成 / AI 服务暂时不可用，请稍后再试 | truth-dare__i5__p2.png |
| 真心话大冒险 `truth-dare` | 5 | 4 人 | ✅ 通过 | 40 / 40 | truth-dare | 3 | 44891 |  | truth-dare__i5__p4.png |
| 谁最可能 `most-likely` | 2 | 2 人 | ✅ 通过 | 40 / 40 | most-likely | 2 | 42462 |  | most-likely__i2__p2.png |
| 谁最可能 `most-likely` | 2 | 4 人 | ❌ 失败 | ? / ? | — | — | — | harness 异常：locator.click: Timeout 25000ms exceeded. | — |
| 谁最可能 `most-likely` | 5 | 2 人 | ✅ 通过 | 40 / 40 | most-likely | 5 | 51210 |  | most-likely__i5__p2.png |
| 谁最可能 `most-likely` | 5 | 4 人 | ❌ 失败 | ? / ? | — | — | — | AI 生成失败：这次生成没有完成 / AI 服务暂时不可用，请稍后再试 | most-likely__i5__p4.png |

### 失败清单

| # | 玩法 | 强度 | 人数 | 失败原因 |
|---|---|---|---|---|
| 1 | 真心话大冒险 `truth-dare` | 5 | 2 人 | AI 生成失败：这次生成没有完成 / AI 服务暂时不可用，请稍后再试 |
| 2 | 谁最可能 `most-likely` | 2 | 4 人 | harness 异常：locator.click: Timeout 25000ms exceeded. |
| 3 | 谁最可能 `most-likely` | 5 | 4 人 | AI 生成失败：这次生成没有完成 / AI 服务暂时不可用，请稍后再试 |

### 截图目录

`test-results/phone/ai-matrix/`（每组 1 张，文件名 `<packId>__i<强度>__p<人数>.png`）
