
# CODE REVIEW

- Task: 音效V1.7全量（分支 `feat/sound-v17`，WebAudio合成＋预设全表＋埋点＋静音开关）
- Commit: 分支未合 main（用户点头才合）
- Reviewer: code-reviewer（本窗口，`opencode/muse-spark-1.3-contributor-free`）
- Result: **PASS**（无 P0/P1；P2 建议 2 项，不挡发版）

## P0 / P1 Findings

- 无。逐项核验均为 PASS：
- (1)引擎 `lib/audio/engine.ts`：WebAudio 现场合成，无音频二进制/无 fetch；无 AudioContext（含 SSR/jsdom/老 Safari 回退）返回 undefined 不抛；`play()`/`startSoundLoop()` 经 muted 检查一律 no-op；首手势前不出声不报错；loop `stop()` 120ms 淡出；全文不读 `prefers-reduced-motion`。
- (2)预设 `lib/audio/presets.ts` 25 个：tap/start-whistle/generate-tick/generate-done/deal/complete/swap/skip/pack-switch/countdown-tick/countdown-go/spin-whoosh/spin-tick/spin-land/chain-enter/compat-same/compat-different/launcher-suspense/launcher-reveal/tool-pick/tool-groups/pause/resume/finish-chord/fanfare；`SOUND_NAMES` 单测锁死不多不少；包络首尾归零不爆音。
- (3)埋点经统一 `play`/`startSoundLoop` 入口：game 主链、转瓶子（whoosh 循环＋减速 tick＋land，暂停清理 loop）、倒数、启动器、工具、生成页、开局哨、首页 tap、总结 fanfare；`app/page.tsx` 加 `"use client"` 只为首页 tap，功能正确。
- (4)静音偏好：`soundMuted` 落 `AppPreferences` 合并写，默认 `false`＝开；`SoundToggle` 用 `Toggle(span+input)` 无 label 包裹、`aria-label="音效开关"`＋状态文字。
- (5)设置页与局中设置共用同一开关→同一引擎＋同一持久化，e2e 覆盖两处一致＋刷新持久化。
- (6)测试：audio-engine 7＋audio-presets 9＋sound-mute 4＝20 项语义断言；`sound.spec` 4 用例只断言无报错（听不见不断言声音，口径正确）。

## P2 / P3 Backlog Findings

- P2：`app/page.tsx` 整页 `"use client"` 只为一个 tap，后续可收敛为小客户端按钮组件。
- P2：`saveSoundMuted` 冗余回填 `recentPlayers`，正确但 fragile，后续可简化。
