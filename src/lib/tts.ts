/**
 * 可插拔的朗读引擎,按句朗读并逐句回调,播放器据此高亮当前句。
 *
 * 两个实现,按有无预生成音频自动选择:
 * - AudioEngine:播放管线预生成的神经语音(public/audio/<slug>/<句序>.mp3,
 *   由 scripts/synthesize.mjs 产出),音质与设备无关。
 * - WebSpeechEngine:浏览器内置语音,作为无音频时的兜底;按质量启发式
 *   自动挑选设备上最好的中文音色,也支持手动切换。
 *
 * 接入 VoxCPM 等自建 TTS 时,只需新增一个实现同接口的引擎(或让管线
 * 换用 VoxCPM 合成,AudioEngine 无需改动)。
 */

export interface SpeechEngine {
  /** 是否在当前环境可用。 */
  isAvailable(): boolean;
  /** 从第 startIndex 句开始朗读整篇。 */
  speak(sentences: string[], startIndex: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setRate(rate: number): void;
  /** 切换音色(仅 WebSpeech 引擎支持)。 */
  setVoice?(voiceURI: string): void;
  /** 每当第 index 句开始朗读时触发。 */
  onSentence(cb: (index: number) => void): void;
  /** 全部读完时触发。 */
  onDone(cb: () => void): void;
}

/** 把段落切成朗读单位的句子,保留结尾标点。与 scripts/synthesize.mjs 保持一致。 */
export function splitSentences(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    const parts = p.match(/[^。!?！？.!?]+[。!?！？.!?]*/g);
    if (parts) {
      for (const s of parts) {
        const t = s.trim();
        if (t) out.push(t);
      }
    } else if (p.trim()) {
      out.push(p.trim());
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 整篇单文件引擎:连续媒体流用于 iOS 锁屏/后台，时间轴驱动高亮与点句          */
/* ------------------------------------------------------------------ */

class FullAudioEngine implements SpeechEngine {
  private audio: HTMLAudioElement | null = null;
  private rate = 1;
  private stopped = false;
  private raf = 0;
  private index = -1;
  // 元数据尚未就绪时，先在用户手势里启动播放，再完成 seek。在 seek 落地前
  // 禁止 timeupdate 把用户刚点的句子又改回第 0 句。
  private pendingSeek: number | null = null;
  private sentenceCb: (i: number) => void = () => {};
  private doneCb: () => void = () => {};

  constructor(
    private slug: string,
    private starts: number[],
  ) {}

  isAvailable() {
    const available =
      typeof window !== "undefined" &&
      typeof Audio !== "undefined" &&
      this.starts.length > 1;
    // 提前加载元数据，让第一次点句尽量在同一次手势里完成 seek + play。
    if (available) this.ensureElement();
    return available;
  }

  private ensureElement(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio(`/audio/${this.slug}/full.mp3`);
      audio.preload = "auto";
      audio.setAttribute("playsinline", "");
      audio.setAttribute("data-easylisten-audio", "");
      audio.hidden = true;
      // 挂到文档中，让 Safari/WKWebView 稳定地把它登记为页面的主媒体元素。
      // 仅保留 JS 创建但未入 DOM 的短音频，在部分微信 WebView 中不会进入锁屏控制器。
      document.body.append(audio);
      audio.addEventListener("timeupdate", this.sync);
      audio.load();
      this.audio = audio;
    }
    return this.audio;
  }

  private indexAt(time: number): number {
    let low = 0;
    let high = this.starts.length - 2;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.starts[mid] <= time) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  private sync = () => {
    if (this.stopped || !this.audio || this.pendingSeek !== null) return;
    const next = this.indexAt(this.audio.currentTime);
    if (next !== this.index) {
      this.index = next;
      this.sentenceCb(next);
    }
  };

  private loop = () => {
    if (this.stopped || !this.audio || this.audio.paused) return;
    this.sync();
    this.raf = requestAnimationFrame(this.loop);
  };

  speak(sentences: string[], startIndex: number) {
    const audio = this.ensureElement();
    this.stopped = false;
    const index = Math.max(
      0,
      Math.min(startIndex, sentences.length - 1, this.starts.length - 2),
    );
    this.index = index;
    this.sentenceCb(index);
    this.pendingSeek = this.starts[index] + 0.001;

    audio.onended = () => {
      if (!this.stopped) {
        cancelAnimationFrame(this.raf);
        this.doneCb();
      }
    };

    const seekAndTrack = () => {
      if (this.pendingSeek === null) return;
      audio.onloadedmetadata = null;
      audio.currentTime = this.pendingSeek;
      this.pendingSeek = null;
      audio.playbackRate = this.rate;
      this.sync();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    };

    if (audio.readyState >= 1) {
      seekAndTrack();
      void audio.play().catch(() => {});
    } else {
      audio.onloadedmetadata = seekAndTrack;
      // iOS 首次播放必须发生在当前用户手势里；元数据到达后只负责 seek。
      void audio.play().catch(() => {});
    }
  }

  pause() {
    this.audio?.pause();
    cancelAnimationFrame(this.raf);
  }

  resume() {
    void this.audio?.play().catch(() => {});
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.stopped = true;
    this.pendingSeek = null;
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onloadedmetadata = null;
      this.audio.removeEventListener("timeupdate", this.sync);
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.remove();
      this.audio = null;
    }
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  onSentence(cb: (i: number) => void) {
    this.sentenceCb = cb;
  }

  onDone(cb: () => void) {
    this.doneCb = cb;
  }
}

/* ------------------------------------------------------------------ */
/* 逐句音频引擎:仅兼容没有整篇时间轴的旧内容                              */
/* ------------------------------------------------------------------ */

class AudioEngine implements SpeechEngine {
  // 关键:全程复用同一个 audio 元素。iOS 在后台/锁屏时会拒绝"没有用户
  // 手势加持的新元素"调 play(),但允许已被点击播放过的元素在 ended 回调里
  // 换 src 续播——每句新建元素会导致锁屏后播完当前句就停。
  private audio: HTMLAudioElement | null = null;
  private preloader: HTMLAudioElement | null = null;
  private total = 0;
  private rate = 1;
  private stopped = false;
  private sentenceCb: (i: number) => void = () => {};
  private doneCb: () => void = () => {};

  constructor(private slug: string) {}

  isAvailable() {
    return typeof window !== "undefined" && typeof Audio !== "undefined";
  }

  private url(i: number) {
    return `/audio/${this.slug}/${i}.mp3`;
  }

  private ensureElement(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      // iOS 上避免劫持成全屏播放
      this.audio.setAttribute("playsinline", "");
    }
    return this.audio;
  }

  private playFrom(i: number) {
    if (this.stopped) return;
    if (i >= this.total) {
      this.doneCb();
      return;
    }
    this.sentenceCb(i);
    const audio = this.ensureElement();
    audio.onended = () => {
      if (!this.stopped) this.playFrom(i + 1);
    };
    // 单句文件缺失或损坏时跳到下一句,不中断整篇
    audio.onerror = () => {
      if (!this.stopped) this.playFrom(i + 1);
    };
    // 部分浏览器换 src 后会重置播放速率,载入元数据后再钉一次
    audio.onloadedmetadata = () => {
      audio.playbackRate = this.rate;
    };
    audio.src = this.url(i);
    audio.playbackRate = this.rate;
    void audio.play().catch(() => {});
    // 预取下一句,消除句间加载间隙(只热 HTTP 缓存,不参与播放)
    if (i + 1 < this.total) {
      if (!this.preloader) {
        this.preloader = new Audio();
        this.preloader.preload = "auto";
      }
      this.preloader.src = this.url(i + 1);
    }
  }

  speak(sentences: string[], startIndex: number) {
    this.stopped = true;
    this.audio?.pause();
    this.stopped = false;
    this.total = sentences.length;
    this.playFrom(startIndex);
  }

  pause() {
    this.audio?.pause();
  }

  resume() {
    void this.audio?.play().catch(() => {});
  }

  stop() {
    this.stopped = true;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.onloadedmetadata = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio = null;
    }
  }

  setRate(rate: number) {
    this.rate = rate;
    // 音频变速即时生效,无需重播
    if (this.audio) this.audio.playbackRate = rate;
  }

  onSentence(cb: (i: number) => void) {
    this.sentenceCb = cb;
  }

  onDone(cb: () => void) {
    this.doneCb = cb;
  }
}

/* ------------------------------------------------------------------ */
/* 浏览器内置语音引擎(兜底)                                              */
/* ------------------------------------------------------------------ */

/** 音色质量启发式:中文优先,增强/自然音色优先,本地音色其次。 */
function scoreVoice(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.lang.startsWith("zh")) s += 10;
  if (/enhanced|premium|natural|neural|siri|多情感|晓/i.test(v.name)) s += 5;
  if (v.localService) s += 1;
  return s;
}

/** 可选音色列表(中文在前,按质量排序),供音色切换 UI 使用。 */
export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return [...window.speechSynthesis.getVoices()]
    .filter((v) => v.lang.startsWith("zh") || v.lang.startsWith("en"))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

class WebSpeechEngine implements SpeechEngine {
  private sentences: string[] = [];
  private index = 0;
  private rate = 1;
  private voiceURI: string | null = null;
  private sentenceCb: (i: number) => void = () => {};
  private doneCb: () => void = () => {};
  private stopped = false;
  private paused = false;
  // cancel() 会异步触发被取消那句的 onend;代数不匹配的回调一律忽略,
  // 防止变速/跳句时旧回调把重复的句子排进队列。
  private generation = 0;

  constructor(voiceURI?: string) {
    this.voiceURI = voiceURI ?? null;
  }

  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (this.voiceURI) {
      const chosen = voices.find((v) => v.voiceURI === this.voiceURI);
      if (chosen) return chosen;
    }
    return (
      [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null
    );
  }

  private speakFrom(i: number) {
    if (this.stopped || i >= this.sentences.length) {
      if (i >= this.sentences.length && !this.stopped) this.doneCb();
      return;
    }
    this.index = i;
    this.sentenceCb(i);
    const gen = this.generation;
    const u = new SpeechSynthesisUtterance(this.sentences[i]);
    const voice = this.pickVoice();
    if (voice) u.voice = voice;
    u.rate = this.rate;
    u.onend = () => {
      if (!this.stopped && gen === this.generation) this.speakFrom(i + 1);
    };
    window.speechSynthesis.speak(u);
  }

  speak(sentences: string[], startIndex: number) {
    this.stop();
    this.stopped = false;
    this.paused = false;
    this.generation++;
    this.sentences = sentences;
    this.speakFrom(startIndex);
  }

  pause() {
    this.paused = true;
    window.speechSynthesis.pause();
  }

  resume() {
    this.paused = false;
    window.speechSynthesis.resume();
  }

  stop() {
    this.stopped = true;
    this.paused = false;
    if (this.isAvailable()) window.speechSynthesis.cancel();
  }

  setRate(rate: number) {
    this.rate = rate;
    // 变速对下一句生效;若正在朗读,从当前句重新起朗读以立即应用。
    this.restartIfPlaying();
  }

  setVoice(voiceURI: string) {
    this.voiceURI = voiceURI;
    this.restartIfPlaying();
  }

  private restartIfPlaying() {
    // 暂停中改变速/音色只记下参数,不能悄悄恢复播放
    if (!this.stopped && !this.paused && this.sentences.length) {
      this.generation++;
      window.speechSynthesis.cancel();
      this.speakFrom(this.index);
    }
  }

  onSentence(cb: (i: number) => void) {
    this.sentenceCb = cb;
  }

  onDone(cb: () => void) {
    this.doneCb = cb;
  }
}

/* ------------------------------------------------------------------ */

export function createSpeechEngine(options: {
  slug: string;
  hasAudio: boolean;
  timings?: number[];
  voiceURI?: string;
}): SpeechEngine {
  if (options.hasAudio && options.timings && options.timings.length > 1) {
    return new FullAudioEngine(options.slug, options.timings);
  }
  if (options.hasAudio) return new AudioEngine(options.slug);
  return new WebSpeechEngine(options.voiceURI);
}
