# 轻听 (EasyListen)

🚀 让阅读变得轻松 - 您的个人有声书转换和播放平台。

> ✨ **项目状态:** 开发中 (In Development)

> 📱 **iOS 移动端:** 本仓库现已包含基于 Expo (React Native + TypeScript) 的 **iOS 移动端重构版本**，
> 位于 [`mobile/`](./mobile) 目录，并已实现原 Web 端"计划中"的**文本转语音 (TTS) 播放**功能。
> 详见 [`mobile/README.md`](./mobile/README.md)。下文为原 Next.js Web 端文档。

## 核心目标

"轻听" 的核心目标是成为一个**个人有声书转换和播放平台**。用户可以上传自己的电子书文件（如 PDF、EPUB、TXT、DOCX），系统会自动将这些文件内容提取成纯文本，并为未来的文本转语音（TTS）功能做好准备，最终实现"让阅读变得轻松"。

## 功能 & 进度

### ✅ 已实现 (Implemented)

*   **用户认证:** 基于 NextAuth.js 的凭证登录和会话管理。
*   **多格式文件上传:** 支持 PDF, EPUB, DOCX, TXT 等多种主流电子书格式。
*   **安全文件存储:** 通过预签名 URL 安全地将文件上传至 Cloudflare R2 对象存储。
*   **后端文件解析:** 在后端 API 路由中，根据文件类型自动调用相应的解析器 (`pdf-parse`, `mammoth` 等) 提取纯文本。
*   **数据持久化:** 使用 Prisma 和 PostgreSQL 存储用户信息、书籍元数据及处理状态。
*   **响应式 UI:** 使用 Tailwind CSS 和 Shadcn/UI 构建的基础前端界面。

### ⏳ 计划中 (Planned)

*   **核心播放功能:** 集成文本转语音 (TTS) 服务，并开发前端音频播放器。
*   **书库管理:** 实现用户个人书库的展示、搜索和管理功能。
*   **订阅系统:** 集成 Stripe 实现付费订阅，解锁高级功能。
*   **国际化 (i18n):** 支持多语言界面。
*   **性能优化与部署:** 优化应用性能并部署到 Vercel。

## 技术栈

*   **框架:** [Next.js](https://nextjs.org/) (App Router & Turbopack)
*   **语言:** [TypeScript](https://www.typescriptlang.org/)
*   **UI:** [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Shadcn/UI](https://ui.shadcn.com/)
*   **认证:** [NextAuth.js](https://next-auth.js.org/)
*   **ORM:** [Prisma](https://www.prisma.io/)
*   **数据库:** [PostgreSQL](https://www.postgresql.org/)
*   **对象存储:** [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)
*   **文件解析:** [pdf-parse](https://www.npmjs.com/package/pdf-parse), [mammoth](https://www.npmjs.com/package/mammoth), [unzipper](https://www.npmjs.com/package/unzipper)

## 项目结构 (当前)

```
easylisten/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── sign-in/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts
│   │   ├── process-book/
│   │   │   │   └── route.ts
│   │   ├── upload/
│   │   │   └── route.ts
│   │   ├── HomePage.tsx      # 主页 (包含上传功能)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx          # 入口页面
│   ├── components/
│   │   └── ui/               # Shadcn/UI 组件
│   ├── lib/
│   │   ├── db.ts             # Prisma Client
│   │   ├── parser.ts         # 多格式文件解析逻辑
│   │   └── utils.ts          # 通用工具函数
│   ├── types/
│   │   └── next-auth.d.ts
│   ├── auth.ts               # NextAuth.js 配置
│   └── middleware.ts         # 认证中间件
├── prisma/
│   └── schema.prisma         # 数据库模型
├── public/
│   └── tesseract/            # (Tesseract.js 残留文件，可清理)
├── .env.local.example        # 环境变量示例 (需要创建)
├── next.config.ts            # Next.js 配置文件
├── package.json
└── tsconfig.json
```

## 本地启动

1.  **克隆项目**
    ```bash
    git clone <your-repository-url>
    cd easylisten
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **设置环境变量**
    复制 `.env.local.example` (如果不存在请手动创建) 为 `.env.local`，并填入以下变量：
    ```env
    # Prisma
    DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

    # NextAuth.js
    AUTH_SECRET="your-super-secret-auth-secret" #
    
    # Cloudflare R2
    R2_ACCOUNT_ID="your-r2-account-id"
    R2_ACCESS_KEY_ID="your-r2-access-key-id"
    R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
    R2_BUCKET_NAME="your-r2-bucket-name"
    ```
    *运行 `openssl rand -base64 32` 可以生成一个安全的 `AUTH_SECRET`。*

4.  **同步数据库**
    ```bash
    npx prisma db push
    ```

5.  **运行开发服务器**
    ```bash
    npm run dev
    ```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看。

---
这份文档旨在帮助我们保持对项目全局的清晰认识，并作为未来开发的路线图。
