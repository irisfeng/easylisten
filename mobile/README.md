# 轻听 EasyListen — iOS 移动端

这是 [轻听 EasyListen](../README.md) 的 **iOS 移动端重构版本**，基于
[Expo](https://expo.dev/)（React Native + TypeScript）构建。它将原 Next.js
Web 应用的核心体验迁移到原生移动端，并**真正实现了原项目中"计划中"的文本转语音（TTS）播放功能**。

> 一句话：上传一本书 → 自动提取文字 → 用自然语音收听。

## ✨ 功能

| 功能 | Web 端（原） | iOS 端（本项目） |
| --- | --- | --- |
| 用户登录 | NextAuth Credentials | 本地凭证校验（`test@example.com` / `password`） |
| 文件上传 | 拖拽 → R2 预签名 URL | 系统文件选择器（`expo-document-picker`）→ App 沙盒 |
| 文本解析 | 服务端 `/api/process-book` | 端上解析（.txt 完整支持） |
| 数据持久化 | Prisma + PostgreSQL | `AsyncStorage` 本地存储 |
| **TTS 播放** | ⏳ 计划中 | ✅ **已实现**（`expo-speech`） |
| 书库管理 | ⏳ 计划中 | ✅ 列表 / 进度 / 删除 |
| 朗读设置 | — | 语言 / 语速 / 音调，可试听 |

首次启动会注入几本内置示例书籍，无需准备文件即可立即体验完整的「上传 → 解析 → 收听」流程。

## 🧱 技术栈

- **框架:** Expo SDK 52 / React Native 0.76
- **语言:** TypeScript（`strict`）
- **路由:** [expo-router](https://docs.expo.dev/router/introduction/)（文件式路由，对应原 Next.js App Router）
- **TTS:** [expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/)
- **文件:** [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/) + [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- **本地存储:** [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/)

## 📁 目录结构

```
mobile/
├── app/                      # expo-router 文件式路由
│   ├── _layout.tsx           # 根布局：Auth / Library Provider + Stack
│   ├── index.tsx             # 入口：按登录态重定向
│   ├── sign-in.tsx           # 登录页
│   ├── (tabs)/               # 底部标签导航
│   │   ├── _layout.tsx       #   书库 / 上传 / 设置
│   │   ├── index.tsx         #   书库（最近书籍）
│   │   ├── upload.tsx        #   上传 & 解析
│   │   └── settings.tsx      #   账户 & 朗读设置
│   └── player/[id].tsx       # TTS 播放器（核心）
├── src/
│   ├── context/              # AuthContext / LibraryContext
│   ├── lib/                  # parser / storage / tts / sampleBooks
│   ├── components/           # 复用 UI（Button/Card/Progress、BookCard）
│   ├── theme.ts              # 设计令牌（沿用蓝色主色）
│   └── types.ts              # 数据模型（对应原 Prisma 模型）
├── assets/                   # 图标 / 启动屏
├── app.json                  # Expo 配置
└── package.json
```

## 🚀 本地运行

> 需要 macOS + Xcode 才能在 iOS 模拟器上运行；Expo Go 可在真机快速预览。

```bash
cd mobile
npm install

# 启动开发服务器
npx expo start          # 然后按 i 打开 iOS 模拟器，或用 Expo Go 扫码

# 也可以
npm run ios             # 直接在 iOS 模拟器中打开
```

质量检查：

```bash
npm run typecheck       # tsc --noEmit（已通过，零错误）
npx expo export --platform ios   # 验证 iOS 打包（已验证可成功打包）
```

测试登录账号：**`test@example.com` / `password`**

## 📝 与原 Web 端的关系

本目录是对原仓库 Web 应用的**移动端重构**，原 Next.js 代码保留在仓库根目录以供参考。
两端共享相同的领域模型（书籍、处理状态）与设计语言。

### 后续可接入

- **云端解析:** PDF / EPUB / DOCX 在端上解析受限，可复用原 `/api/process-book`
  的服务端逻辑，移动端上传后调用云端解析返回文本。
- **账号与云同步:** 将本地 `AsyncStorage` 书库替换为后端 API（NextAuth/Prisma）。
- **后台音频:** 已在 `app.json` 中声明 `UIBackgroundModes: ["audio"]`，
  可进一步集成锁屏控制与播放队列。
