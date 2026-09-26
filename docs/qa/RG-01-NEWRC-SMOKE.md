# RG-01 新RC离线smoke（机器侧，2026-09-26，真机实测）

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
