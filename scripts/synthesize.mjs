/**
 * 预生成神经语音:为每篇没有音频的听稿逐句合成 MP3,
 * 写入 public/audio/<slug>/<句序>.mp3,并更新 public/audio/manifest.json。
 *
 * 用微软 Edge 神经语音(免费、无需 key),在 GitHub Actions 中运行:
 *   node scripts/synthesize.mjs
 *
 * 按句分文件与播放器的句级模型天然对齐:高亮、跳句、点句播放都无需时间轴。
 * 注意:这是过渡方案(非官方接口);商用规模化前应切换到自建 VoxCPM
 * 或官方云 TTS,见 docs/tts-evaluation.md。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const ROOT = resolve(import.meta.dirname, "..");
const AUDIO_DIR = resolve(ROOT, "public/audio");
const MANIFEST = resolve(AUDIO_DIR, "manifest.json");
const VOICE = "zh-CN-XiaoxiaoNeural";
// 双语实验:带英文稿的篇目额外合成英文音频(目录 <slug>-en)
const EN_VOICE = "en-US-AriaNeural";

/** 与 src/lib/tts.ts 的 splitSentences 保持一致。 */
function splitSentences(paragraphs) {
  const out = [];
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

const pieces = [
  ...JSON.parse(readFileSync(resolve(ROOT, "content/daily.json"), "utf8")),
  ...JSON.parse(readFileSync(resolve(ROOT, "content/seeds.json"), "utf8")),
];

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : { voice: VOICE, slugs: [] };

async function synthesize(text, voice = VOICE) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    tts.close();
  }
}

/** 为一组段落逐句合成到 public/audio/<unit>/,成功后登记进 manifest。 */
async function synthesizeUnit(unit, paragraphs, voice) {
  if (manifest.slugs.includes(unit)) return;
  // 句序与播放器一致:0 = 第一句正文(intro 不进入朗读)
  const bodySentences = splitSentences(paragraphs);
  const dir = resolve(AUDIO_DIR, unit);
  mkdirSync(dir, { recursive: true });
  try {
    for (let i = 0; i < bodySentences.length; i++) {
      const file = resolve(dir, `${i}.mp3`);
      if (existsSync(file)) continue;
      writeFileSync(file, await synthesize(bodySentences[i], voice));
    }
    manifest.slugs.push(unit);
    console.log(`ok   ${unit}: ${bodySentences.length} 句`);
  } catch (e) {
    console.log(`fail ${unit}: ${e.message}`);
  }
}

for (const piece of pieces) {
  await synthesizeUnit(piece.slug, piece.paragraphs, VOICE);
  if (piece.en) {
    await synthesizeUnit(`${piece.slug}-en`, piece.en.paragraphs, EN_VOICE);
  }
}

manifest.voice = VOICE;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`manifest: ${manifest.slugs.length} pieces with audio`);
