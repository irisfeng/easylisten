/**
 * 可插拔的朗读引擎。
 *
 * 当前落地实现基于浏览器内置的 Web Speech API —— 零成本、零延迟、离线可用,
 * 适合先把完整的聆听体验跑通。它以句子为单位朗读,并在每句开始时回调,
 * 播放器据此高亮正在读的句子。
 *
 * 若要接入 VoxCPM 等神经 TTS(48kHz、可克隆音色),只需实现同一个
 * SpeechEngine 接口:把句子发给后端 /v1/audio/speech,用 <audio> 播放返回的
 * 音频,并在每段音频的 play/ended 时触发相同的回调。播放器代码无需改动。
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
  /** 每当第 index 句开始朗读时触发。 */
  onSentence(cb: (index: number) => void): void;
  /** 全部读完时触发。 */
  onDone(cb: () => void): void;
}

/** 把段落切成朗读单位的句子,保留结尾标点。 */
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

class WebSpeechEngine implements SpeechEngine {
  private sentences: string[] = [];
  private index = 0;
  private rate = 1;
  private sentenceCb: (i: number) => void = () => {};
  private doneCb: () => void = () => {};
  private stopped = false;

  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.startsWith("zh")) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0] ??
      null
    );
  }

  private speakFrom(i: number) {
    if (this.stopped || i >= this.sentences.length) {
      if (i >= this.sentences.length && !this.stopped) this.doneCb();
      return;
    }
    this.index = i;
    this.sentenceCb(i);
    const u = new SpeechSynthesisUtterance(this.sentences[i]);
    const voice = this.pickVoice();
    if (voice) u.voice = voice;
    u.rate = this.rate;
    u.onend = () => {
      if (!this.stopped) this.speakFrom(i + 1);
    };
    window.speechSynthesis.speak(u);
  }

  speak(sentences: string[], startIndex: number) {
    this.stop();
    this.stopped = false;
    this.sentences = sentences;
    this.speakFrom(startIndex);
  }

  pause() {
    window.speechSynthesis.pause();
  }

  resume() {
    window.speechSynthesis.resume();
  }

  stop() {
    this.stopped = true;
    if (this.isAvailable()) window.speechSynthesis.cancel();
  }

  setRate(rate: number) {
    this.rate = rate;
    // 变速对下一句生效;若正在朗读,从当前句重新起朗读以立即应用。
    if (!this.stopped && this.sentences.length) {
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

export function createSpeechEngine(): SpeechEngine {
  return new WebSpeechEngine();
}
