# 轻听 · EasyListen

一个可以听的阅读空间。从科学到新闻,从深度长文到流行文化——挑一篇,让它读给你听。

本仓库是"轻听"的**全新重构版本**:以极简、编辑排版式的界面,搭配以句为单位的朗读播放器,
把"阅读"变成"聆听"。

## 设计取向

界面遵循一套"高级实用主义极简"原则(参考 [MengTo/Skills · minimalist-ui](https://github.com/MengTo/Skills)):

- **暖色单色画布**,颜色只作为语义点缀(六个领域各配一枚淡彩标签)。
- **强烈的字体层级**:标题与引文用衬线体(Newsreader),正文/UI 用系统无衬线体,
  元信息用等宽体。
- **极致扁平**:1px 细线分隔,无重投影、无渐变、无大圆角。
- **克制的动效**:内容随滚动轻柔淡入(IntersectionObserver),只动 `transform`/`opacity`。

## 核心体验

- **六领域首页**:科学 / 技术 / 社会 / 人文 / 生活 / 文化,一键筛选,列表随进入视口错峰淡入。内容体系(领域 × 形态 × 时效)见 [`docs/content-architecture.md`](./docs/content-architecture.md)。
- **聆听式阅读页**:点击任意句子即可从该处开始朗读;正在朗读的句子会被高亮,
  随朗读在文中平滑滑动。
- **顺手的播放器**:底部常驻,播放/暂停、上一句/下一句、变速(0.8×–1.5×)、顶部进度条。
- **键盘操作**:<kbd>空格</kbd> 播放/暂停,<kbd>←</kbd> <kbd>→</kbd> 跳句。

## 朗读引擎(可插拔)

朗读能力抽象为 `SpeechEngine` 接口(`src/lib/tts.ts`),层层回落:

- **超拟人双声(默认)**:`scripts/synthesize.mjs` 用 MiniMax `speech-2.8-hd`
  为中文新稿生成女声/男声；双语实验的中文固定女声，右上角只切换中/英。
  (账号不可用时自动降级 `speech-02-hd`)合成**女主持(默认)与男声**两套音频,
  文章页一键切换,选择记在本地;缺 `MINIMAX_API_KEY` 时回落免费 Edge 晓晓,
  出刊永不断更。音色经三轮真人盲选定妆。
- **整篇零停顿**:逐句 MP3 拼成 `full.mp3` + 句级时间轴(`manifest.timings`),
  播放器单文件连续播放,句间无停顿;高亮/点句跳转/变速靠时间轴反查,
  锁屏与后台是一条系统级音频流。
- **三层发音治理**:分句器先保护小数等不可拆文本;中文数字按上下文转换成
  无歧义朗读稿;MiniMax 请求再启用中文增强和逐句发音词典。全大写缩写与
  字母数字型号自动逐字符朗读,人名/多音字等固定规则维护在
  `content/pronunciations.json`,页面始终显示原文。
- **Web Speech 兜底**:无预生成音频的文章走浏览器内置语音。

选型细节见 [`docs/tts-evaluation.md`](./docs/tts-evaluation.md)。

## 自动精选管线

每天北京时间早 6 点(GitHub Actions),从大量互联网内容中精挑细选并自动出刊:

1. **召回** `scripts/ingest.mjs`:抓取 `content/sources.json` 里 45 个精选源
   (中文源 15 个,约 33%),按核心权威/深度、可信常规、发现源分层,
   并做去重、分源时效过滤和多源共振检测(热点信号)
2. **精选** `scripts/curate.mjs`:大模型按 `content/rubric.md` 的评分标准与
   编排规则选出每日 2–6 篇(80 分门槛,宁缺毋滥);每期配"主编的话",
   每周六额外产出一篇 10 分钟"周末深读";达到 85 分、抓到全文的篇目
   最多 2 篇附英文转述稿(文章页 EN 切换),优先有解释价值的实时事件
3. **取全文**:用 [Firecrawl Keyless](https://www.firecrawl.dev/blog/firecrawl-keyless-launch)
   免费抓取入选文章原文(无需 API key),听稿严格基于原文转述;抓取失败
   回落 RSS 摘要
4. **听稿改写**:转述而非照读,注明出处;**合成语音** `scripts/synthesize.mjs`
   逐句生成 MP3;自动提交,Vercel 自动发布

### 启用自动出刊

模型走 **OpenAI 兼容接口**,在仓库 **Settings → Secrets and variables → Actions**
配置以下任一 secret 即可(脚本自动识别):

| Secret 名 | 服务 | 默认模型 |
|---|---|---|
| `DEEPSEEK_API_KEY` | [DeepSeek](https://platform.deepseek.com) | `deepseek-chat` |
| `DASHSCOPE_API_KEY` | 阿里百炼(DashScope) | `qwen-plus` |
| `OPENAI_API_KEY` | OpenAI 兼容服务 | 需另配 `LLM_BASE_URL` |

可选变量(Variables)`LLM_MODEL` / `LLM_BASE_URL` 覆盖默认模型与地址。
Firecrawl 与语音合成均免费,无需任何配置。

## 技术栈

- [Next.js 15](https://nextjs.org/)(App Router)
- [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com/)
- Web Speech API(朗读)

## 本地运行

```bash
npm install
npm run dev      # 开发
npm run build    # 生产构建
npm run start    # 运行生产构建
```

打开 http://localhost:3000。

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              # 根布局与字体
│   ├── page.tsx                # 首页:频道筛选 + 文章列表
│   ├── globals.css             # 设计系统(色板、字体、动效、句子高亮)
│   └── listen/[slug]/
│       ├── page.tsx            # 阅读页(静态生成)
│       └── Reader.tsx          # 聆听体验与播放器
├── components/
│   └── Reveal.tsx              # 滚动淡入
└── lib/
    ├── content.ts              # 频道与文章模型
    ├── pieces.ts               # 文章内容
    ├── tts.ts                  # 可插拔朗读引擎(SpeechEngine)
    └── utils.ts                # 类名拼接等通用工具
```
