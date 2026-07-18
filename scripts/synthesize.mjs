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

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
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
      // 零字节视同缺失:合成偶发静默失败留下的空文件要重新合成
      if (existsSync(file) && statSync(file).size > 0) continue;
      writeFileSync(file, await synthesize(bodySentences[i], voice));
    }
    manifest.slugs.push(unit);
    console.log(`ok   ${unit}: ${bodySentences.length} 句`);
  } catch (e) {
    console.log(`fail ${unit}: ${e.message}`);
  }
}

/**
 * 整篇拼接:把 <unit>/ 下的逐句 MP3 按序拼成 full.mp3,并用 ffprobe 量出
 * 每句时长写入 manifest.timings(累计起点秒,末位为总时长)。
 * 播放器据此单文件连续播放——句间零停顿,高亮与点句跳转靠时间轴反查。
 * 同码率同参数的 MP3 帧直接拼接即可正常播放。
 */
// ffprobe 最准;环境没有它时退回 CBR 估算——合成参数固定 48kbps,
// 时长 = 字节数 × 8 / 48000,对恒定码率 MP3 误差在毫秒级
let hasFfprobe = true;
try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
} catch {
  hasFfprobe = false;
  console.log("ffprobe 不可用,时长改用 CBR 估算");
}

function probeDuration(file, size) {
  if (hasFfprobe) {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { encoding: "utf8" },
    );
    const d = parseFloat(out.trim());
    if (!Number.isFinite(d) || d <= 0) throw new Error(`时长异常: ${file}`);
    return d;
  }
  return (size * 8) / 48000;
}

function buildFull(unit) {
  const dir = resolve(AUDIO_DIR, unit);
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => /^\d+\.mp3$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));
  if (!files.length) return;
  const starts = [];
  const bufs = [];
  let acc = 0;
  for (const f of files) {
    const p = resolve(dir, f);
    starts.push(Number(acc.toFixed(3)));
    const buf = readFileSync(p);
    // 修复失败仍残留的空文件按 0 时长跳过字节,句序与阅读页保持对齐
    if (buf.length > 0) {
      bufs.push(buf);
      acc += probeDuration(p, buf.length);
    }
  }
  starts.push(Number(acc.toFixed(3)));
  writeFileSync(resolve(dir, "full.mp3"), Buffer.concat(bufs));
  manifest.timings ??= {};
  manifest.timings[unit] = starts;
  console.log(`full ${unit}: ${files.length} 句 / ${acc.toFixed(1)}s`);
}

for (const piece of pieces) {
  await synthesizeUnit(piece.slug, piece.paragraphs, VOICE);
  if (piece.en) {
    await synthesizeUnit(`${piece.slug}-en`, piece.en.paragraphs, EN_VOICE);
  }
}

// 修复用:按音频目录名(slug 或 slug-en)找回句子文本
const textByUnit = new Map();
for (const piece of pieces) {
  textByUnit.set(piece.slug, piece.paragraphs);
  if (piece.en) textByUnit.set(`${piece.slug}-en`, piece.en.paragraphs);
}

/** 重合成单元里缺失/零字节的句子文件(空文件是偶发合成失败的残留)。 */
async function repairUnit(unit) {
  const paras = textByUnit.get(unit);
  const dir = resolve(AUDIO_DIR, unit);
  if (!paras || !existsSync(dir)) return;
  const sentences = splitSentences(paras);
  const voice = unit.endsWith("-en") ? EN_VOICE : VOICE;
  for (let i = 0; i < sentences.length; i++) {
    const file = resolve(dir, `${i}.mp3`);
    if (existsSync(file) && statSync(file).size > 0) continue;
    try {
      writeFileSync(file, await synthesize(sentences[i], voice));
      console.log(`repair ${unit}/${i}`);
    } catch (e) {
      console.log(`repair fail ${unit}/${i}: ${e.message}`);
    }
  }
}

// 为所有还没有时间轴的既有篇目回填 full.mp3(先修空文件,再拼现有文件)
for (const unit of manifest.slugs) {
  if (manifest.timings?.[unit]) continue;
  try {
    await repairUnit(unit);
    buildFull(unit);
  } catch (e) {
    console.log(`full fail ${unit}: ${e.message}`);
  }
}

manifest.voice = VOICE;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`manifest: ${manifest.slugs.length} pieces with audio`);
