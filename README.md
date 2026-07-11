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

朗读能力抽象为 `SpeechEngine` 接口(`src/lib/tts.ts`),按有无预生成音频自动选择:

- **预生成神经语音(默认)**:`scripts/synthesize.mjs` 在 GitHub Actions 用
  Edge 神经语音逐句合成 MP3(`public/audio/<slug>/<句序>.mp3`),经 CDN 分发,
  音质与设备无关;按句分文件与播放器句级模型天然对齐,变速即时生效。
- **Web Speech 兜底**:无音频的文章走浏览器内置语音,按质量启发式自动挑选
  设备上最好的中文音色,播放器内可手动切换并记住选择。
- **升级路径**:接入 **[VoxCPM](https://github.com/OpenBMB/VoxCPM)**(48kHz、
  可克隆音色)时只需让管线换用它合成,播放器无需改动。

选型细节见 [`docs/tts-evaluation.md`](./docs/tts-evaluation.md)。

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
