# AI-MATRIX｜AI 出牌全矩阵实测

- 日期：2026-09-26
- 执行：builder（本窗口）
- 被测服务：Mac 本机 `http://127.0.0.1:3000`（dev 常驻服务）→ `POST /api/generate-session`
- Provider：`deepseek-official` / `baseUrl=https://api.deepseek.com` / `model=deepseek-flash`
- 鉴权：`Authorization: Bearer <key>`（key 运行时从 `.env.local` 读入内存，未落盘、未打印、未入库）
- 矩阵：7 玩法 × 强度 {低2／中3／高5} × 人数 {2／4／6} = **63 组**，每组 `targetCardCount=10`
- 调用约束：相邻调用间隔 ≥3s；失败重试 1 次仍失败才记失败（本轮 0 次重试）
- 版本基线：`package.json` 1.5.0，HEAD `b08ceb8`

## 一、总览

| 指标 | 结果 |
|---|---|
| 组合总数 | 63 |
| 通过 | **63** |
| 通过率 | **100.0%** |
| 重试次数 | 0 |
| HTTP 状态分布 | 200 × 63 |
| 返回卡数 = 10 | 63/63 |
| 服务端 schema（`aiDeckResponseSchema`）校验通过 | 63/63 |
| packId 与请求玩法一致 | 63/63 |
| 卡强度 ≤ 会话强度上限 | 63/63 |
| 耗时 最小/中位/平均/最大 | 2950 / 4182 / 4265 / 7748 ms |

**结论：矩阵 63/63 全绿，无失败组、无 schema 不合规、无串包、无超强度。**

## 二、组合明细

| 玩法 | 强度 | 人数 | HTTP | 卡数 | schema | 强度≤上限 | 结果 | 耗时(ms) | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 真心话大冒险 `truth-dare` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4501 |  |
| 真心话大冒险 `truth-dare` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4176 |  |
| 真心话大冒险 `truth-dare` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3970 |  |
| 真心话大冒险 `truth-dare` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4056 |  |
| 真心话大冒险 `truth-dare` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4123 |  |
| 真心话大冒险 `truth-dare` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4395 |  |
| 真心话大冒险 `truth-dare` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4311 |  |
| 真心话大冒险 `truth-dare` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4261 |  |
| 真心话大冒险 `truth-dare` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5018 |  |
| 谁最可能 `most-likely` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4410 |  |
| 谁最可能 `most-likely` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3949 |  |
| 谁最可能 `most-likely` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3593 |  |
| 谁最可能 `most-likely` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3768 |  |
| 谁最可能 `most-likely` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4116 |  |
| 谁最可能 `most-likely` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4296 |  |
| 谁最可能 `most-likely` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4820 |  |
| 谁最可能 `most-likely` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3831 |  |
| 谁最可能 `most-likely` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3992 |  |
| 我从来没有 `never-have` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4062 |  |
| 我从来没有 `never-have` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3615 |  |
| 我从来没有 `never-have` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3737 |  |
| 我从来没有 `never-have` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4598 |  |
| 我从来没有 `never-have` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3784 |  |
| 我从来没有 `never-have` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3974 |  |
| 我从来没有 `never-have` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4118 |  |
| 我从来没有 `never-have` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4486 |  |
| 我从来没有 `never-have` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3484 |  |
| 二选一 `would-you-rather` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3448 |  |
| 二选一 `would-you-rather` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4391 |  |
| 二选一 `would-you-rather` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3896 |  |
| 二选一 `would-you-rather` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4182 |  |
| 二选一 `would-you-rather` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5012 |  |
| 二选一 `would-you-rather` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4435 |  |
| 二选一 `would-you-rather` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5011 |  |
| 二选一 `would-you-rather` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3923 |  |
| 二选一 `would-you-rather` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4555 |  |
| 指人游戏 `pointing-game` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5052 | minPlayers>2（玩法下限，非故障） |
| 指人游戏 `pointing-game` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3054 |  |
| 指人游戏 `pointing-game` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3763 |  |
| 指人游戏 `pointing-game` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4522 | minPlayers>2（玩法下限，非故障） |
| 指人游戏 `pointing-game` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4024 |  |
| 指人游戏 `pointing-game` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4441 |  |
| 指人游戏 `pointing-game` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4366 | minPlayers>2（玩法下限，非故障） |
| 指人游戏 `pointing-game` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 2950 |  |
| 指人游戏 `pointing-game` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3086 |  |
| 默契测试 `compatibility-test` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3588 |  |
| 默契测试 `compatibility-test` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3741 |  |
| 默契测试 `compatibility-test` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4594 |  |
| 默契测试 `compatibility-test` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4517 |  |
| 默契测试 `compatibility-test` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3384 |  |
| 默契测试 `compatibility-test` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 7402 |  |
| 默契测试 `compatibility-test` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3577 |  |
| 默契测试 `compatibility-test` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 7748 |  |
| 默契测试 `compatibility-test` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3421 |  |
| 转瓶子 `spin-bottle` | 低(2) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4719 |  |
| 转瓶子 `spin-bottle` | 低(2) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4605 |  |
| 转瓶子 `spin-bottle` | 低(2) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4554 |  |
| 转瓶子 `spin-bottle` | 中(3) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5067 |  |
| 转瓶子 `spin-bottle` | 中(3) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 3851 |  |
| 转瓶子 `spin-bottle` | 中(3) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4358 |  |
| 转瓶子 `spin-bottle` | 高(5) | 2 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4643 |  |
| 转瓶子 `spin-bottle` | 高(5) | 4 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 5076 |  |
| 转瓶子 `spin-bottle` | 高(5) | 6 人 | 200 | 10/10 | ✅ | ✅ | ✅ 通过 | 4297 |  |

## 三、发现（非失败，供产品判断）

1. **指人游戏 × 2 人**：3 组（I=2/3/5，P=2）返回卡中存在 `minPlayers > 2`（玩法能力声明 `minPlayers:3`）。AI 按玩法下限出卡，schema 与玩法定义都允许，属**玩法下限提示**而非故障；但主局若仅 2 人启用「指人游戏」，这些卡不可用。建议产品侧在配置层禁用「2 人 + 指人游戏」组合，或由 AI 在 prompt 里被告知实际人数。
2. **转瓶子（`spin-bottle`）也出卡**：其 renderer 为 `spin`（本地无卡玩法），但 `buildDeckPrompt` 的 `playablePacks` 只过滤了「随机玩一个」，未过滤转瓶子，因此单独启用转瓶子时仍会生成 10 张 `spin-bottle` 卡。上游不报错、schema 也过，但**这些卡在主局不会被渲染**（cardless）。属可优化项，不影响本次通过率。
3. 无超时、无 429、无 `KEY_REQUIRED`、无 `INVALID_OUTPUT`，上游链路稳定。

## 四、复现方式（自包含，不依赖临时件）

请求体形状（逐格唯一变化的是 `intensity`／`players` 长度／`enabledPackIds`）：

```jsonc
POST http://127.0.0.1:3000/api/generate-session
Authorization: Bearer <PARTY_NIGHT_DEV_AI_API_KEY>
{
  "profile": { "id":"deepseek-official","type":"deepseek-official","name":"DeepSeek 官方",
               "baseUrl":"https://api.deepseek.com","modelId":"deepseek-flash",
               "protocol":"openai-chat-completions","isDefault":true,"experimental":false,
               "autoFallback":false,"enabled":true,"updatedAt":"<ISO>" },
  "sessionConfig": { "players": [ /* N 条 {id,displayName,active:true,createdAt,lastUsedAt} */ ],
                     "relationship":"朋友聚会","vibes":["轻松","热闹"],"intensity":2,
                     "boundaries": { /* boundaryProfile 全 10 个布尔 + customText:""，本轮回测全 false */ },
                     "enabledPackIds": ["truth-dare"], "mode": "single" },
  "targetCardCount": 10,
  "sessionId": "matrix-<packId>-<intensity>-<players>-<attempt>-<ts>"
}
```

判定口径：HTTP 200 且响应通过 `lib/ai/card-schema.ts` 的 `aiDeckResponseSchema` 即记通过；`players` 卡数是否 10、packId 是否等于请求玩法、`card.intensity <= sessionConfig.intensity` 另记三个语义维度。相邻调用间隔 ≥3s，失败重试 1 次。

编号：7 个出卡玩法 = `BUILTIN_GAME_PACKS` 去掉「随机玩一个」（`random-launcher`，`requiresAIContent:false` 且被 `buildDeckPrompt` 显式过滤）后的 7 个（含 `spin-bottle`）。

逐格原始数据（status/cards/schema/packId/intensity/minPlayers/attempt/latency）为本次执行的临时采集件，按项目规则已随 `temp/` 清理；本文件「二、组合明细」即其固化后的完整转写。
