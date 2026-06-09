import * as Speech from "expo-speech";
import { TtsSettings } from "@/types";

// 将长文本切分为适合 TTS 朗读的小段。
// expo-speech 对单次朗读的长度有限制（iOS 上尤为明显），
// 因此按句子/长度切分，逐段朗读，并可在段间续播与定位。
export function chunkText(text: string, maxLen = 220): string[] {
  const normalized = text.replace(/\s+\n/g, "\n").trim();
  if (!normalized) return [];

  // 优先按中英文句末标点切分
  const sentences = normalized
    .split(/(?<=[。！？.!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      // 句子本身过长，按字数硬切
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      for (let i = 0; i < sentence.length; i += maxLen) {
        chunks.push(sentence.slice(i, i + maxLen));
      }
      continue;
    }
    if ((buffer + sentence).length > maxLen) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export interface SpeakOptions {
  settings: TtsSettings;
  onDone: () => void;
  onError?: (e: unknown) => void;
}

export function speak(chunk: string, opts: SpeakOptions): void {
  Speech.speak(chunk, {
    language: opts.settings.language,
    rate: opts.settings.rate,
    pitch: opts.settings.pitch,
    onDone: opts.onDone,
    onStopped: () => {
      /* 用户主动停止，不触发 onDone */
    },
    onError: opts.onError,
  });
}

export function stop(): void {
  Speech.stop();
}

export async function getAvailableLanguages(): Promise<string[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const langs = Array.from(new Set(voices.map((v) => v.language))).sort();
    return langs.length ? langs : ["zh-CN", "en-US"];
  } catch {
    return ["zh-CN", "en-US"];
  }
}
