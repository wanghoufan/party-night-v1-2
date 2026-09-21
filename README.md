# Party Night

简体中文 | [English](./README.en.md)

一个无需账号、可离线继续的移动端聚会游戏 PWA，帮助朋友在酒吧、家庭聚会和破冰场景中快速开局。

![Party Night](./public/brand/party-night-logo.svg)

## 能做什么

- 配置 2 人以上的玩家、关系、氛围、强度与内容雷区，然后开始一整局游戏。
- 混合或单独游玩「真心话大冒险」「谁最可能」「我从来没有」和「AI 即兴」。
- 也可单独玩「二选一」「指人游戏」「默契测试」「转瓶子」，或在同一局中随时切换玩法（Session、玩家、尺度保留）。
- 用「随机点名」「随机分组」两个小工具热场；去游戏包的规则库查小姐牌、国王杯等 8 种常见酒桌规则（含变体与无酒精版）。
- 开局前一次准备整局 Deck（题卡集）；生成后断网仍能完成、换题、跳过和恢复当前 Session。
- 使用本地题库离线开局，或配置 DeepSeek 官方、OpenCode Go 与自定义 OpenAI Compatible Provider。
- 创建、编辑、启停和删除仅保存在本设备的自定义游戏包。
- 局中调节强度、暂停/继续、增加玩家或将玩家设为暂离，结束后查看轻量总结。

## 快速开始

需要 Node.js 24.x 和 pnpm 11.x。

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，点击「今晚开局」。不配置 AI 也可在生成页选择「使用本地题库开始」。

## AI Provider 与 API Key

在首页进入「AI 模型设置」：

1. 首次进入默认选中 DeepSeek 官方（`https://api.deepseek.com` / `deepseek-flash`）。
2. 填写 API Key，选择是否使用 Web Crypto 加密后保存到本设备。取消勾选时仅当前浏览器会话可用。
3. 可先「测试连接」，再「保存配置」。
4. OpenCode Go 只是实验性、用户手动启用的 Provider；它不是默认项，也不会被自动 fallback。其官方接口主要面向 OpenCode 等 coding agents，兼容性可能变化。
5. Custom OpenAI Compatible 只允许 HTTPS 公网地址；服务端会阻止 localhost（非开发环境）、私网、link-local、metadata、DNS 解析后的非公网地址和重定向。

要删除密钥，使用页面底部独立的红色 Danger Zone。首次点击只会打开确认框；取消会保留原 Key，只有再次点击红色「确认清空」才会删除。

### 仅开发环境的 env fallback

正常用户不需要 `.env`。如需本地联调，可复制配置样例：

```bash
cp .env.example .env.local
```

```dotenv
PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK=false
PARTY_NIGHT_DEV_AI_API_KEY=
```

样例默认关闭，需要联调时把 `false` 改为 `true`。只在非 production 环境、显式开启开关且请求未携带用户 Key 时才会使用该 fallback。不得将 `.env.local` 或真实 Key 提交到仓库，也不得使用 `NEXT_PUBLIC_` 前缀暴露密钥。

## 数据与安全

- 玩家偏好、游戏包、Session、Deck 快照和总结保存在当前浏览器的 IndexedDB `party-night-v1` 中，不上传云数据库。
- 持久化 API Key 使用 AES-GCM 加密；IndexedDB 只保存密文、随机 IV 和不可导出的 `CryptoKey`。安全持久化不可用时自动退化为 session-only，不会明文落盘。
- API Key 只在测试或生成请求期间临时发送给同源 Proxy，不进入 URL、Session、普通偏好、日志或服务端持久化存储。
- Service Worker 不拦截 `/api/` 请求，AI 请求不进入 Cache Storage。

### 备份与清除

V1 暂无内置数据导出/导入。如需保留本地数据，请备份对应浏览器 Profile，并避免清理该站点的存储数据。清除浏览器的该站点数据会删除所有本地偏好、自定义游戏包、Session 与密钥密文；如只想删除 API Key，请使用 AI 设置页的 Danger Zone。

## PWA 安装与离线

生产环境应通过 HTTPS 访问（localhost 开发例外）。使用浏览器的「添加到主屏幕」或「安装应用」操作安装 Party Night。首次在线访问页面并完成 Deck 准备后，已缓存的当前 Session 可离线重载并继续本地游戏。

## 生产构建与 Docker

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm start
```

Docker 镜像不需要内置个人 API Key：

```bash
docker build -t party-night .
docker run --rm -p 3000:3000 party-night
```

请只在可信设备上部署，并由反向代理或私有网络入口提供 HTTPS。

## 技术说明

- Next.js 16.3.3、React 19、TypeScript 5、Tailwind CSS 4 与 CSS Design Tokens
- Zod 负责 AI 输出、Session 与本地数据校验
- `idb` 封装 IndexedDB；Web Crypto 负责本机密钥加密
- Vitest + Testing Library + Playwright

Party Game Engine 与 Game Pack 相互解耦：Engine 管理玩家、抽卡、强度、雷区、轮次和存储，Pack 只提供定义与题卡。

## V1 范围

Party Night V1 是单设备、本地优先应用。当前不提供账号、支付、云数据库、公共社区或多人实时房间。

