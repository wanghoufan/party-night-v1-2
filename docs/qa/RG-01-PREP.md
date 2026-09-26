# RG-01 准备证据（机器侧，IN_PROGRESS，非最终PASS/FAIL）

- RC commit：6dc861b（+db56516 HANDOFF同步），main已同步，working tree干净（仅本文件待交）
- 真机：Redmi 22041216UC，Android 14，设备号 IN9LZTAYV4UGU4JF（adb在线；另有 indq5xfi6hovay4d 在线未用）
- APK：android/app/build/outputs/apk/debug/app-debug.apk，2026-09-26 从当前HEAD重建（JDK21，BUILD SUCCESSFUL）+ cap sync + install -r Success + monkey拉起有pid
- Mac本地服务：:3000 空闲，`pnpm start` 200，APK经由该服务加载（见下条）
- 首页截图：真机实拍首页正常渲染（Party Night标题/8玩法入口/四Tab），见 /tmp/rg01-home2.png

## 重要发现（RG-01离线项阻塞说明）

- capacitor.config.ts 当前含 `server.url=http://192.168.31.60:3000/`（局域网版）：APK是该地址的瘦客户端，Mac :3000停掉即 ERR_CONNECTION_REFUSED（已实测复现）。
- 含义：RG-01第4/5项（断网本地出题、刷新/重启Session恢复）在此APK形态下测的只是“浏览器经Mac服务”的行为，不是“App本体离线”行为；PWA Service Worker离线能力另有桌面smoke覆盖，未在真机App验证。
- 判定：不记FAIL（RC业务代码无缺陷），记为RG-01准备阶段的已知形态限制； ОБРАТИТЬСЯ：要么接受“局域网在线版”RG-01（离线项改测PWA桌面smoke+文献记录），要么另起Change（自包含离线包：去server.url+webDir出包重建+RC重冻）再测。等用户拍板。

## 待用户上手（机器无法代做）

1. 在该真机上走relationship-aware主线进入（RG-01第3项）；
2. 飞行模式开关→本地出题/恢复/计数检查（第4~7项）；
3. 查IndexedDB/localStorage/URL/日志/导出/cache无单向秘密互选内容（第8项）；
4. final/mutual/MATCH恢复符合契约（第9项）；
5. 回填步骤/结果，RG-01判PASS或FAIL（二态）。
