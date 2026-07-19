<div align="center">
  <img src="./public/icons/icon-192.png" width="88" height="88" alt="轻听 EasyListen 图标" />
  <h1>轻听 · EasyListen</h1>
  <p><strong>眼睛太忙了，把阅读交给耳朵。</strong></p>
  <p>
    一个为“听”重新编辑的中文阅读空间。<br />
    每天从大量来源里挑出少数值得听的内容，改写成听稿，再用自然语音讲给你听。
  </p>
  <p>
    <a href="https://easylisten.shddai.net"><strong>在线体验</strong></a>
    ·
    <a href="./docs/content-architecture.md">内容体系</a>
    ·
    <a href="./docs/roadmap.md">路线图</a>
    ·
    <a href="./docs/ios-app.md">iOS 指南</a>
  </p>
  <p>
    <a href="https://easylisten.shddai.net"><img alt="Website" src="https://img.shields.io/badge/Website-Live-141413?style=flat-square" /></a>
    <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-141413?style=flat-square&logo=nextdotjs" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-141413?style=flat-square&logo=react" />
    <img alt="PWA" src="https://img.shields.io/badge/PWA-ready-141413?style=flat-square&logo=pwa" />
    <img alt="iOS" src="https://img.shields.io/badge/iOS-Capacitor-141413?style=flat-square&logo=apple" />
  </p>
</div>

![轻听桌面端日刊首页](./docs/assets/readme/easylisten-home.png)

## 不是更多内容，而是更值得听的内容

信息从来不缺。缺的是筛选、判断，以及一种不占用眼睛的阅读方式。

轻听把**编辑标准、内容改写和朗读体验**放进同一条生产线。它不做无限信息流，也不把网页机械地转换成语音：每天只选 2–6 篇，低于质量门槛就不收；听稿基于来源原文重新组织，保留出处，并专门为耳朵理解而写。

## 产品亮点

| | 能力 | 体验 |
| --- | --- | --- |
| 🗞️ | **每日编辑精选** | 51 个中英文内容源，经过时效过滤、跨天去重、多源共振识别和质量评分，组成每日刊。 |
| 🎧 | **连续聆听** | 整篇单文件播放，无句间停顿；支持逐句高亮、点句跳转、锁屏控制和 `0.8×–1.5×` 变速。 |
| ✍️ | **为耳朵写作** | 不是照读、直译或简单摘要，而是把原文转述为口语化、脱离屏幕也能理解的中文听稿。 |
| 🌏 | **双语与音色** | 高分且取得完整原文的部分篇目提供英文转述；部分中文篇目支持男女声切换。 |
| ✨ | **无账号个性化** | 兴趣、收藏和完听记录默认保存在本地，只用于“为你精选”；匿名云备份是可选项。 |
| 🖼️ | **自然地分享** | 每篇内容都能生成带二维码的图片卡片，可直接调用系统分享面板或长按保存。 |
| 📱 | **多端体验** | 响应式 Web、PWA 与 Capacitor iOS 外壳共用同一套内容和播放逻辑。 |
| 🛡️ | **可观测出刊** | GitHub Actions 每天自动出刊；任一步失败都会创建 Issue，不让断更静默发生。 |

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./docs/assets/readme/easylisten-reader-mobile.png" width="360" alt="轻听移动端逐句高亮播放器" />
      <br />
      <sub><strong>边听边读</strong> · 当前句高亮、自动跟随、随时跳句</sub>
    </td>
    <td align="center" width="50%">
      <img src="./docs/assets/readme/easylisten-share-card.png" width="360" alt="轻听文章分享卡片" />
      <br />
      <sub><strong>一键分享</strong> · 自动排版的文章卡片与直达二维码</sub>
    </td>
  </tr>
</table>

## 从原文到耳机

```text
RSS / Atom 内容源
        ↓
召回 · 时效过滤 · 去重 · 热点信号识别
        ↓
编辑标准评分 · 选题 · 每日编排
        ↓
获取原文 · 重组为中文听稿
        ↓
分句 · 数字与发音治理 · TTS 合成
        ↓
整篇音频 · 句级时间轴 · 自动发布
```

编辑规则集中维护在 [`content/rubric.md`](./content/rubric.md)。候选内容按信息密度、原创见解、可听性、时效与长青价值评分，**80 分是入选门槛**；周六可额外编排一篇约 10 分钟的“周末深读”。

每天北京时间 06:00，GitHub Actions 自动执行召回、精选、改写、语音合成和提交。完整实现见 [每日精选工作流](./.github/workflows/daily-curation.yml)。

## 5 分钟跑起来

### 环境要求

- Node.js 22（与 GitHub Actions 保持一致）
- npm
- 仅在本地生成整篇音频时需要 `ffmpeg` / `ffprobe`

### 启动

```bash
git clone https://github.com/irisfeng/easylisten.git
cd easylisten
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。仓库已包含示例内容和预生成音频，**浏览产品不需要任何 API Key**。

### 验证

```bash
npm run test:speech      # 分句、数字与发音规则
npm run test:curation    # 内容源与编排策略
npm run build            # Next.js 生产构建
```

## 朗读如何工作

朗读能力通过 [`SpeechEngine`](./src/lib/tts.ts) 抽象，并按可用条件分层降级：

1. 配置 `MINIMAX_API_KEY` 时，新稿优先使用 MiniMax `speech-2.8-hd`，不可用时自动尝试 `speech-02-hd`。
2. 未配置 MiniMax 时，生成管线回落到 Microsoft Edge 神经语音。
3. 文章没有预生成音频时，页面使用浏览器 Web Speech API 兜底。

生成前还会治理小数、中文数字、字母数字型号、缩写、多音字和自定义人名读音。页面始终展示原文，朗读规则维护在 [`content/pronunciations.json`](./content/pronunciations.json)。选型过程与技术边界见 [TTS 评估](./docs/tts-evaluation.md)。

## 启用自动出刊

精选脚本使用 OpenAI 兼容接口。在仓库的 **Settings → Secrets and variables → Actions** 中配置以下任意一个 Secret：

| Secret | 服务 | 默认模型 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek | `deepseek-chat` |
| `DASHSCOPE_API_KEY` | 阿里百炼 | `qwen-plus` |
| `OPENAI_API_KEY` | OpenAI 或兼容服务 | `gpt-4o-mini` |

可选配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `LLM_MODEL` | 覆盖默认精选模型 |
| Variable | `LLM_BASE_URL` | 覆盖 OpenAI 兼容接口地址 |
| Secret | `MINIMAX_API_KEY` | 生成 MiniMax 中文语音；未配置时回落 Edge TTS |
| Variable | `MINIMAX_TTS_MODEL` | 覆盖默认 MiniMax 模型 |

完整原文通过 Firecrawl Keyless 获取，无需单独配置 Firecrawl Key。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web | Next.js 15 App Router、React 19、TypeScript、Tailwind CSS 4 |
| Audio | MiniMax TTS、Microsoft Edge TTS、Web Speech API、Media Session API |
| Product | Vercel Analytics、PWA、Capacitor 8 for iOS |
| Optional | Supabase 匿名偏好同步 |
| Automation | GitHub Actions、OpenAI-compatible LLM、Firecrawl Keyless |

## 项目结构

```text
easylisten/
├── .github/workflows/       # 每日出刊、补生成音频与音色盲选
├── content/                 # 内容源、编辑标准、日刊与发音词典
├── docs/                    # 内容、TTS、同步、iOS 与路线图文档
├── ios/                     # Capacitor iOS 工程
├── public/audio/            # 预生成音频与句级时间轴
├── scripts/                 # 召回、精选、语音合成及策略测试
└── src/
    ├── app/                 # 首页、阅读页和全局样式
    ├── components/          # 通用交互组件
    └── lib/                 # 内容、偏好、同步与朗读引擎
```

## 文档

- [内容架构](./docs/content-architecture.md) — 领域 × 形态 × 时效的内容模型
- [TTS 评估](./docs/tts-evaluation.md) — 朗读方案、盲选结果与演进边界
- [偏好云同步](./docs/prefs-sync.md) — 无账号的 Supabase 可选配置
- [iOS App 指南](./docs/ios-app.md) — 本地运行、后台播放与 TestFlight
- [路线图](./docs/roadmap.md) — 当前产品方向与后续计划

## 参与建设

欢迎通过 [Issue](https://github.com/irisfeng/easylisten/issues) 提交问题、内容源建议或功能想法，也欢迎直接发起 Pull Request。涉及编辑策略的改动，请同时说明它如何影响内容质量与可听性。

---

<div align="center">
  <strong>每天几篇，宁缺毋滥。</strong><br />
  <sub>轻听 EasyListen</sub>
</div>
