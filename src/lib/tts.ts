/**
 * 可插拔的朗读引擎,按句朗读并逐句回调,播放器据此高亮当前句。
 *
 * 两个实现,按有无预生成音频自动选择:
 * - FullAudioEngine:播放管线预生成的整篇神经语音(<音频根>/<slug>/full.mp3,
 *   由 scripts/synthesize.mjs 产出),句级高亮与点句靠 manifest 里的时间轴。
 *   音频根地址见 src/lib/audio-url.ts。
 * - WebSpeechEngine:浏览器内置语音,作为无音频时的兜底;按质量启发式
 *   自动挑选设备上最好的中文音色,也支持手动切换。
 *
 * 接入 VoxCPM 等自建 TTS 时,只需新增一个实现同接口的引擎(或让管线
 * 换用 VoxCPM 合成,FullAudioEngine 无需改动)。
 */

import { audioUrl } from "./audio-url";

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
  /** 接管已在播放本音轨的音频(连续播放切到下一篇时)；接管成功返回 true。 */
  attach?(): boolean;
  /** 播放被外部暂停或恢复(来电、控制中心、自动播放被拦)时触发。 */
  onPlayState?(cb: (playing: boolean) => void): void;
  /** 网络缓冲开始/结束时触发。 */
  onBuffering?(cb: (buffering: boolean) => void): void;
  /** 音频加载或播放失败时触发。 */
  onProblem?(cb: () => void): void;
}

/** 把段落切成朗读单位的句子,保留结尾标点。与 scripts/synthesize.mjs 保持一致。 */
export { splitSentences } from "./speech-text.js";

/* ------------------------------------------------------------------ */
/* 整篇单文件引擎:连续媒体流用于 iOS 锁屏/后台，时间轴驱动高亮与点句          */
/* ------------------------------------------------------------------ */

// 全站只用这一个 audio 元素。iOS 在后台/锁屏时会拒绝"没有用户手势加持的
// 新元素"调 play()，但允许已被点击播放过的元素换 src 续播——连续播放下一篇
// 靠的就是这一点，所以切换文章时元素不能销毁重建。
let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.setAttribute("data-easylisten-audio", "");
    audio.hidden = true;
    // 挂到文档中，让 Safari/WKWebView 稳定地把它登记为页面的主媒体元素。
    // 未入 DOM 的音频在部分微信 WebView 中不会进入锁屏控制器。
    document.body.append(audio);
    sharedAudio = audio;
  }
  return sharedAudio;
}

function loadUnit(unit: string): HTMLAudioElement {
  const audio = getSharedAudio();
  if (audio.dataset.unit !== unit) {
    audio.dataset.unit = unit;
    audio.src = audioUrl(unit);
    audio.load();
  }
  return audio;
}

/**
 * 立刻开始播放某条音轨，之后再跳转到它的阅读页，由那里的引擎 attach() 接管。
 * 必须在用户手势或上一篇的 ended 回调里同步调用：等页面跳转完成再 play()
 * 已经脱离手势，锁屏时页面还可能在跳转途中被系统挂起。
 */
export function primeAudio(unit: string) {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  const audio = loadUnit(unit);
  if (audio.currentTime > 0) audio.currentTime = 0;
  void audio.play().catch(() => {});
}

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
  private playStateCb: (playing: boolean) => void = () => {};
  private bufferingCb: (buffering: boolean) => void = () => {};
  private problemCb: () => void = () => {};

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

  /** 共享元素此刻是否还属于本音轨(下一篇接手后就不再是)。 */
  private owns(audio: HTMLAudioElement) {
    return audio.dataset.unit === this.slug;
  }

  private ensureElement(): HTMLAudioElement {
    const audio = loadUnit(this.slug);
    if (this.audio !== audio) {
      this.audio = audio;
      audio.addEventListener("timeupdate", this.sync);
      audio.addEventListener("play", this.onPlay);
      audio.addEventListener("pause", this.onPause);
      audio.addEventListener("waiting", this.onWaiting);
      audio.addEventListener("playing", this.onPlaying);
      audio.addEventListener("error", this.onError);
      audio.onended = () => {
        if (this.stopped) return;
        cancelAnimationFrame(this.raf);
        this.doneCb();
      };
    }
    this.applyRate(audio);
    return audio;
  }

  private applyRate(audio: HTMLAudioElement) {
    // 换 src 会把 playbackRate 重置为 defaultPlaybackRate，两个都要设。
    audio.defaultPlaybackRate = this.rate;
    audio.playbackRate = this.rate;
  }

  private onPlay = () => {
    if (!this.stopped) this.playStateCb(true);
  };

  // 来电、拔耳机、系统控制中心都会直接暂停元素，界面要跟着变。
  private onPause = () => {
    if (this.stopped || !this.audio || !this.owns(this.audio) || this.audio.ended) return;
    cancelAnimationFrame(this.raf);
    this.playStateCb(false);
  };

  private onWaiting = () => {
    if (!this.stopped) this.bufferingCb(true);
  };

  private onPlaying = () => {
    if (this.stopped) return;
    this.bufferingCb(false);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  };

  private onError = () => {
    if (this.stopped || !this.audio || !this.owns(this.audio)) return;
    this.bufferingCb(false);
    this.problemCb();
  };

  private play(audio: HTMLAudioElement) {
    if (audio.readyState < 3) this.bufferingCb(true);
    void audio.play().catch((error: unknown) => {
      if (this.stopped) return;
      const name = error instanceof DOMException ? error.name : "";
      // AbortError 只是被后一次 seek/换源打断，不是故障。
      if (name === "AbortError") return;
      this.bufferingCb(false);
      // NotAllowedError 是浏览器拦下了自动播放，等用户自己点播放即可。
      if (name === "NotAllowedError") this.playStateCb(false);
      else this.problemCb();
    });
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
    if (this.stopped || !this.audio || !this.owns(this.audio) || this.pendingSeek !== null) return;
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

  attach() {
    if (typeof window === "undefined" || !sharedAudio) return false;
    if (!this.owns(sharedAudio) || sharedAudio.paused || sharedAudio.ended) return false;
    const audio = this.ensureElement();
    this.stopped = false;
    this.sync();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    if (audio.readyState < 3) this.bufferingCb(true);
    return true;
  }

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

    const seekAndTrack = () => {
      if (this.pendingSeek === null) return;
      audio.onloadedmetadata = null;
      audio.currentTime = this.pendingSeek;
      this.pendingSeek = null;
      this.applyRate(audio);
      this.sync();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    };

    if (audio.readyState >= 1) seekAndTrack();
    else audio.onloadedmetadata = seekAndTrack;
    // iOS 首次播放必须发生在当前用户手势里；元数据到达后只负责 seek。
    this.play(audio);
  }

  pause() {
    this.audio?.pause();
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (!this.audio) return;
    this.play(this.audio);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.stopped = true;
    this.pendingSeek = null;
    cancelAnimationFrame(this.raf);
    const audio = this.audio;
    if (!audio) return;
    audio.removeEventListener("timeupdate", this.sync);
    audio.removeEventListener("play", this.onPlay);
    audio.removeEventListener("pause", this.onPause);
    audio.removeEventListener("waiting", this.onWaiting);
    audio.removeEventListener("playing", this.onPlaying);
    audio.removeEventListener("error", this.onError);
    audio.onended = null;
    audio.onloadedmetadata = null;
    // 下一篇已经接手共享元素时不能把它也停掉。
    if (this.owns(audio)) audio.pause();
    this.audio = null;
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.audio) this.applyRate(this.audio);
  }

  onSentence(cb: (i: number) => void) {
    this.sentenceCb = cb;
  }

  onDone(cb: () => void) {
    this.doneCb = cb;
  }

  onPlayState(cb: (playing: boolean) => void) {
    this.playStateCb = cb;
  }

  onBuffering(cb: (buffering: boolean) => void) {
    this.bufferingCb = cb;
  }

  onProblem(cb: () => void) {
    this.problemCb = cb;
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
  return new WebSpeechEngine(options.voiceURI);
}
