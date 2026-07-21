<div align="center">
  <img src="./public/icons/icon-192.png" width="88" height="88" alt="轻听 EasyListen 图标" />
  <h1>轻听 · EasyListen</h1>
  <p><strong>接送路上，给孩子听见更大的世界。</strong></p>
  <p>
    为 6-9、10-12、13-16 三个年龄段的家庭，<br />
    每天挑选少量值得听的中文与英文内容。
  </p>
  <p>
    <a href="https://easylisten.shddai.net"><strong>在线体验</strong></a>
    ·
    <a href="#本地运行">本地运行</a>
    ·
    <a href="./content/rubric.md">编辑标准</a>
    ·
    <a href="./docs/product-core.md">产品核心</a>
    ·
    <a href="./docs/product-design-principles.md">产品原则</a>
  </p>
  <p>
    <a href="https://github.com/irisfeng/easylisten/actions/workflows/daily-curation.yml"><img alt="每日精选" src="https://github.com/irisfeng/easylisten/actions/workflows/daily-curation.yml/badge.svg" /></a>
    <a href="https://easylisten.shddai.net"><img alt="在线状态" src="https://img.shields.io/badge/Website-Live-2f5d4c?style=flat" /></a>
    <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-111111?style=flat&logo=nextdotjs" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=flat&logo=react" />
    <img alt="Mobile Web PWA" src="https://img.shields.io/badge/Mobile_Web-PWA-111111?style=flat&logo=pwa" />
  </p>
</div>

<p align="center">
  <a href="https://easylisten.shddai.net">
    <img src="./docs/assets/readme/easylisten-home.png" width="390" alt="轻听移动端少年刊首页" />
  </a>
</p>

## 为什么做轻听

很多家长希望孩子多了解一点真实世界，却没有时间每天从新闻、杂志、播客和信息流里筛选内容。孩子面对的选择更多，也更难判断什么值得花时间。

轻听把这件费心的事接过来。每天从可信来源中挑出少量内容，核对出处，重新编辑成适合耳朵理解的听稿。上学、放学或周末出行时，打开就能听。

它不是课程，也不要求打卡。我们更在意孩子是否愿意继续追问：为什么会这样，还有没有另一种看法？

## 产品原则

| 原则 | 轻听怎么做 |
| --- | --- |
| 少而精 | 每期 2-6 篇，80 分是发布门槛。没有足够好的内容就少发。 |
| 真正分龄 | 每篇明确标注 6-9、10-12、13-16 中的一个或多个年龄段，不使用笼统的“适合 6-16 岁”。 |
| 来源透明 | 展示标准发布者、原文标题、原始链接、发布时间、获取时间与内容依据。 |
| 适合耳朵 | 不照读网页，不做生硬摘要。编辑时重组叙事、解释背景，并保留事实边界。 |
| 不制造焦虑 | 没有课程表、积分、排名和连续打卡，不把理解世界变成另一份作业。 |
| 最少儿童数据 | 账号属于家长，不建立儿童实名档案，不收集姓名、学校、生日或精确位置。 |

## 三个年龄段，三种编辑尺度

| 年龄段 | 学习阶段 | 内容尺度 |
| --- | --- | --- |
| **6-9 岁** | 小学低年级 | 从故事、人物和可观察的现象出发，用具体例子讲清因果。 |
| **10-12 岁** | 小学高年级 | 开始解释机制、历史背景和不同观点，帮助孩子建立知识之间的联系。 |
| **13-16 岁** | 初中阶段 | 保留真实世界的复杂度，接触论证、证据、语境、文体和观点之间的张力。 |

高质量成人刊物不等于少年适读。文学批评、社会科学和公共议题来源都设置保守的最低年龄下限，具体文章还要根据概念密度、情绪安全和背景要求逐篇上调。

## 听什么

轻听覆盖科学、技术、社会、人文、生活和文化六个领域，也在持续增加更丰富的非虚构文本：文学随笔与批评、人物访谈、叙事历史、经济学解释、公共议题、传记和评论。

选择这些内容不是为了押题。我们希望孩子慢慢熟悉几件更长久的事：作者如何提出问题，证据怎样支撑结论，语境如何改变理解，不同观点为什么会出现，以及一种文体如何形成自己的声音。

当前受控源库包含 **74 个中英文来源**，其中 **22 个来自中国大陆发布者**。来源分为 `realtime`、`analysis`、`depth` 和 `discovery` 四种角色。发现源只提供线索，不能凭热度进入正式听稿。

国内现实与国际视野按数量近似 1:1 动态均衡：双方有足量达标内容时，
最终篇数差不超过 1；不为凑比例降低质量门槛。完整准入规则和配置可以直接查看：

- [`docs/product-core.md`](./docs/product-core.md)：每天开始前重温的用户、核心功能与决策边界
- [`content/rubric.md`](./content/rubric.md)：编辑评分、少年适配、双语与发布红线
- [`content/sources.json`](./content/sources.json)：受控来源、角色、时效窗口与最低适龄段
- [`docs/source-review-2026-07-19.md`](./docs/source-review-2026-07-19.md)：来源核查与扩充记录
- [`docs/content-architecture.md`](./docs/content-architecture.md)：领域、内容形态与时效模型

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./docs/assets/readme/easylisten-reader-mobile.png" width="360" alt="轻听收听页与原始来源卡" />
      <br />
      <sub><strong>边听边读</strong> · 来源卡、逐句高亮与移动播放器</sub>
    </td>
    <td align="center" width="50%">
      <img src="./docs/assets/readme/easylisten-share-card.png" width="360" alt="轻听少年刊分享卡片" />
      <br />
      <sub><strong>自然分享</strong> · 少年刊风格内容卡片与直达二维码</sub>
    </td>
  </tr>
</table>

## 已实现的体验

- **无需登录即可收听**：访客可以浏览、播放和分享全部公开内容。
- **可选的家长账号**：邮箱验证码登录，不设密码。登录只用于跨设备同步年龄段、兴趣、收藏和收听偏好。
- **年龄段真正影响内容**：切换年龄段会调整当期节目单和往期内容，不只是改变界面标签。
- **连续收听**：整篇音频、逐句高亮、点句跳转、变速、音色切换和 Media Session 控制。
- **中英双语**：只为取得足量完整原文且达到更高质量门槛的内容提供英文轨。
- **克制的配图**：每天允许零张，最多两张编辑缩略图。敏感现场新闻不会自动生图。
- **移动端优先**：主要体验针对手机 Web 与 PWA，桌面端保持完整可用。

## 从来源到耳机

```text
受控 RSS / Atom 来源
        ↓
时效过滤 · 跨天去重 · 多源信号 · 国内内容可见度
        ↓
来源分层 · 编辑评分 · 逐篇分龄 · 领域编排
        ↓
获取完整原文 · 核对出处 · 重组为可听中文
        ↓
按需生成 0-2 张缩略图 · 敏感主题跳过
        ↓
朗读文本治理 · TTS 合成 · 句级时间轴
        ↓
来源卡 · 整篇音频 · 自动发布
```

GitHub Actions 每天北京时间 06:00 执行完整生产线。任务失败会自动创建 Issue，避免静默断更。同一天重复运行时，成本闸门默认跳过付费模型、语音和生图；只有手动勾选 `force_regenerate` 才会重新生成。

工作流见 [`.github/workflows/daily-curation.yml`](./.github/workflows/daily-curation.yml)。

## 本地运行

### 环境要求

- Node.js 22
- npm
- 仅在本地生成整篇音频时需要 `ffmpeg` 和 `ffprobe`

### 启动项目

```bash
git clone https://github.com/irisfeng/easylisten.git
cd easylisten
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。仓库包含示例内容和预生成音频，只浏览与收听不需要 API Key。

### 运行验证

```bash
npm exec tsc -- --noEmit
npm run test:speech
npm run test:curation
npm run build
```

## 家长账号

复制环境变量模板：

```bash
cp .env.example .env.local
```

| 变量 | 用途 |
| --- | --- |
| `AUTH_SECRET` | Auth.js 会话加密密钥，使用高强度随机值并长期保持稳定 |
| `TURSO_DATABASE_URL` | 轻听独立 Turso 数据库地址 |
| `TURSO_AUTH_TOKEN` | 数据库最小权限令牌 |
| `RESEND_API_KEY` | 发送邮箱验证码 |
| `AUTH_EMAIL_FROM` | 已验证域名下的发件人，例如 `轻听 <login@mail.example.com>` |

```bash
npm run db:migrate
```

验证码只保存摘要，默认 10 分钟过期，使用后立即失效。接口限制同一邮箱与 IP 的请求频率。更多说明见 [`docs/prefs-sync.md`](./docs/prefs-sync.md)。

## 自动出刊配置

精选脚本使用 OpenAI 兼容接口。在仓库 **Settings > Secrets and variables > Actions** 中配置以下任意一个 Secret：

| Secret | 服务 | 默认模型 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek | `deepseek-chat` |
| `DASHSCOPE_API_KEY` | 阿里百炼 | `qwen-plus` |
| `OPENAI_API_KEY` | OpenAI 或兼容服务 | `gpt-4o-mini` |

其他可选配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `LLM_MODEL` | 覆盖默认精选模型 |
| Variable | `LLM_BASE_URL` | 覆盖 OpenAI 兼容接口地址 |
| Secret | `MINIMAX_API_KEY` | 生成中文语音，未配置时回落到 Edge TTS |
| Variable | `MINIMAX_TTS_MODEL` | 覆盖默认 MiniMax 语音模型 |
| Variable | `MINIMAX_MAX_CHARS_PER_RUN` | 单次 MiniMax 计费字符硬上限，默认 `12000` |
| Secret | `ARK_API_KEY` | 按需生成豆包 Seedream 编辑缩略图 |
| Variable | `ARK_IMAGE_MODEL` | 覆盖默认 Seedream 模型 |
| Variable | `ARK_MAX_IMAGES_PER_RUN` | 单次付费图片硬上限，范围 `0-2` |
| Variable | `DASHSCOPE_IMAGE_MODEL` | 百炼兜底生图模型 |
| Variable | `IMAGE_SELECTOR_MODEL` | 判断文章是否值得配图的文字模型 |

完整原文通过 Firecrawl Keyless 获取，不需要单独配置 Firecrawl Key。配图失败不会阻断内容和语音发布。

## 朗读方案

[`SpeechEngine`](./src/lib/tts.ts) 按可用条件分层降级：

1. 配置 `MINIMAX_API_KEY` 时，新稿优先使用 MiniMax 中文语音。
2. 未配置 MiniMax 时，生产管线回落到 Microsoft Edge 神经语音。
3. 页面没有预生成音频时，使用浏览器 Web Speech API 兜底。

合成前会处理小数、年份、范围、比例、温度、缩写、字母数字型号和固定读音。朗读规则维护在 [`content/pronunciations.json`](./content/pronunciations.json)，评估记录见 [`docs/tts-evaluation.md`](./docs/tts-evaluation.md)。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web | Next.js 15 App Router、React 19、TypeScript、Tailwind CSS 4 |
| Account | Auth.js 5、Turso / libSQL、Resend 邮箱验证码 |
| Audio | MiniMax TTS、Microsoft Edge TTS、Web Speech API、Media Session API |
| Product | 移动 Web、PWA、Vercel Analytics、Capacitor 8 iOS 外壳 |
| Automation | GitHub Actions、OpenAI-compatible LLM、Firecrawl Keyless |

## 项目结构

```text
easylisten/
├── .github/workflows/       # 每日出刊、补生成语音与音色盲选
├── content/                 # 来源、编辑标准、日刊和发音词典
├── db/migrations/           # 家长账号与偏好同步数据库结构
├── docs/                    # 产品、内容、来源、TTS、同步与 iOS 文档
├── public/                  # 图标、编辑缩略图和预生成音频
├── scripts/                 # 召回、精选、审计、迁移、语音和策略测试
└── src/
    ├── app/                 # 首页、收听页、登录、账号与 API
    ├── components/          # 通用交互组件
    └── lib/                 # 内容、账号、偏好、数据库和朗读引擎
```

## 项目文档

- [产品设计原则](./docs/product-design-principles.md)
- [编辑标准](./content/rubric.md)
- [内容架构](./docs/content-architecture.md)
- [来源审查](./docs/source-review-2026-07-19.md)
- [TTS 评估](./docs/tts-evaluation.md)
- [偏好与账号同步](./docs/prefs-sync.md)
- [iOS App 指南](./docs/ios-app.md)
- [产品路线图](./docs/roadmap.md)

## 参与建设

欢迎通过 [Issue](https://github.com/irisfeng/easylisten/issues) 提交问题、推荐可靠来源或分享真实使用感受，也欢迎发起 Pull Request。

推荐新来源时，请说明发布机构、来源角色、主要领域、适合年龄和可信依据。来源数量不是目标。长期稳定地选出少数好内容，才是轻听想做好的事。

---

<div align="center">
  <strong>每天几篇，宁缺毋滥。</strong><br />
  <sub>轻听 EasyListen</sub>
</div>
