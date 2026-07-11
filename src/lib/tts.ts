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
/* 预生成音频引擎                                                        */
/* ------------------------------------------------------------------ */

class AudioEngine implements SpeechEngine {
  private audio: HTMLAudioElement | null = null;
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

  private playFrom(i: number) {
    if (this.stopped) return;
    if (i >= this.total) {
      this.doneCb();
      return;
    }
    this.sentenceCb(i);
    this.detach();
    const audio = new Audio(this.url(i));
    this.audio = audio;
    audio.playbackRate = this.rate;
    audio.onended = () => {
      if (!this.stopped) this.playFrom(i + 1);
    };
    // 单句文件缺失或损坏时跳到下一句,不中断整篇
    audio.onerror = () => {
      if (!this.stopped) this.playFrom(i + 1);
    };
    void audio.play().catch(() => {});
    // 预取下一句,消除句间加载间隙
    if (i + 1 < this.total) {
      const next = new Audio();
      next.preload = "auto";
      next.src = this.url(i + 1);
    }
  }

  private detach() {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
  }

  speak(sentences: string[], startIndex: number) {
    this.stop();
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
    this.detach();
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
  voiceURI?: string;
}): SpeechEngine {
  if (options.hasAudio) return new AudioEngine(options.slug);
  return new WebSpeechEngine(options.voiceURI);
}
