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

// —— 超拟人双声(盲选定音):配了 MINIMAX_API_KEY 时,新篇目合成
// 女声(默认,目录 <slug>)与男声(目录 <slug>-m)两套;未配则回落 Edge ——
const MM_KEY = process.env.MINIMAX_API_KEY;
const MM_FEMALE = "presenter_female";
const MM_MALE = "male-qn-jingying";
// 型号按新旧排序逐个尝试:2.8 为当前旗舰;若账号/地域暂不可用,
// 自动降级到盲选时实测可用的 speech-02-hd,并全程记住可用型号
const MM_MODELS = [
  ...new Set([process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd", "speech-02-hd"]),
];
let mmModelIdx = 0;
// MiniMax 当前套餐按模型限制 RPM。句级音频一次需要很多请求，若连续发送，
// 第 2～3 篇就会触发 1002 限流。把请求起点控制在每 2.1 秒一次（< 30 RPM），
// 并允许测试/紧急修复时通过环境变量覆盖。
const MM_MIN_INTERVAL_MS = Number(process.env.MINIMAX_MIN_INTERVAL_MS || 2100);
const MM_RATE_LIMIT_WAIT_MS = Number(process.env.MINIMAX_RATE_LIMIT_WAIT_MS || 65000);
const MM_RATE_LIMIT_RETRIES = Number(process.env.MINIMAX_RATE_LIMIT_RETRIES || 3);
let mmNextRequestAt = 0;
const MM_GROUP_ID = (() => {
  try {
    const payload = JSON.parse(Buffer.from(MM_KEY.split(".")[1], "base64").toString());
    return payload.GroupID ?? payload.group_id ?? "";
  } catch {
    return "";
  }
})();

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForMiniMaxSlot() {
  const waitMs = Math.max(0, mmNextRequestAt - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  mmNextRequestAt = Date.now() + MM_MIN_INTERVAL_MS;
}

async function synthesizeMiniMaxWith(text, voiceId, model) {
  await waitForMiniMaxSlot();
  const res = await fetch(
    `https://api.minimaxi.com/v1/t2a_v2${MM_GROUP_ID ? `?GroupId=${MM_GROUP_ID}` : ""}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MM_KEY}` },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 64000, format: "mp3", channel: 1 },
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  const json = await res.json();
  const hex = json?.data?.audio;
  if (!hex) {
    const detail = json?.base_resp ?? json;
    const error = new Error(
      `minimax(${model}) HTTP ${res.status} ${JSON.stringify(json?.base_resp ?? json).slice(0, 160)}`,
    );
    // MiniMax 用 HTTP 200 + 业务码 1002 表示 RPM 限流。它不是模型兼容性错误，
    // 不能因此降级型号；否则两个型号会被依次打满，产生一批半成品。
    error.rateLimited =
      detail?.status_code === 1002 && /rate limit/i.test(detail?.status_msg ?? "");
    throw error;
  }
  return Buffer.from(hex, "hex");
}

async function synthesizeMiniMax(text, voiceId) {
  for (; mmModelIdx < MM_MODELS.length; mmModelIdx++) {
    for (let attempt = 0; attempt <= MM_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await synthesizeMiniMaxWith(text, voiceId, MM_MODELS[mmModelIdx]);
      } catch (e) {
        if (e.rateLimited && attempt < MM_RATE_LIMIT_RETRIES) {
          console.log(
            `minimax RPM 限流，等待 ${Math.ceil(MM_RATE_LIMIT_WAIT_MS / 1000)} 秒后重试 ` +
              `(${attempt + 1}/${MM_RATE_LIMIT_RETRIES})`,
          );
          await sleep(MM_RATE_LIMIT_WAIT_MS);
          continue;
        }
        // 只有模型本身失败才尝试旧型号；RPM 限流在同一型号上等待重试。
        if (e.rateLimited || mmModelIdx === MM_MODELS.length - 1) throw e;
        console.log(
          `minimax 型号降级 ${MM_MODELS[mmModelIdx]} → ${MM_MODELS[mmModelIdx + 1]}: ${e.message}`,
        );
        break;
      }
    }
  }
}

const silenceCache = new Map();

/**
 * 分句规则为保持历史音频下标稳定，会把句末引号偶尔拆成独立的“””句。
 * TTS 服务对纯标点可能返回 0 字节；用极短静音保留该下标，避免之后所有句子错位。
 */
function synthesizeSilence(v) {
  const bitrate = v.engine === "minimax" ? "64k" : "48k";
  if (!silenceCache.has(bitrate)) {
    silenceCache.set(
      bitrate,
      execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=32000:cl=mono",
          "-t",
          "0.12",
          "-b:a",
          bitrate,
          "-f",
          "mp3",
          "pipe:1",
        ],
        { maxBuffer: 1024 * 1024 },
      ),
    );
  }
  return silenceCache.get(bitrate);
}

/** 统一发声入口:v = { engine: "edge" | "minimax", voice }。 */
async function speak(text, v) {
  if (!/[\p{L}\p{N}]/u.test(text)) return synthesizeSilence(v);
  return v.engine === "minimax" ? synthesizeMiniMax(text, v.voice) : synthesize(text, v.voice);
}

/** 按音频目录名推断该单元的声音(修复与 CBR 码率估算共用)。 */
function voiceForUnit(unit) {
  if (unit.endsWith("-en")) return { engine: "edge", voice: EN_VOICE };
  if (unit.endsWith("-m")) return { engine: "minimax", voice: MM_MALE };
  // 基础中文单元:存在 -m 兄弟目录说明是双声篇(MiniMax 女声),否则是旧的晓晓
  if (MM_KEY && existsSync(resolve(AUDIO_DIR, `${unit}-m`))) {
    return { engine: "minimax", voice: MM_FEMALE };
  }
  return { engine: "edge", voice: VOICE };
}

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
const synthesisFailures = [];
const requiredUnits = new Map();

async function synthesize(text, voice = VOICE) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error(`edge/${voice} 返回空音频`);
    return audio;
  } finally {
    tts.close();
  }
}

/** 为一组段落逐句合成到 public/audio/<unit>/,成功后登记进 manifest。 */
async function synthesizeUnit(unit, paragraphs, v) {
  requiredUnits.set(unit, paragraphs);
  if (manifest.slugs.includes(unit)) return true;
  // 句序与播放器一致:0 = 第一句正文(intro 不进入朗读)
  const bodySentences = splitSentences(paragraphs);
  const dir = resolve(AUDIO_DIR, unit);
  mkdirSync(dir, { recursive: true });
  try {
    for (let i = 0; i < bodySentences.length; i++) {
      const file = resolve(dir, `${i}.mp3`);
      // 零字节视同缺失:合成偶发静默失败留下的空文件要重新合成
      if (existsSync(file) && statSync(file).size > 0) continue;
      writeFileSync(file, await speak(bodySentences[i], v));
    }
    manifest.slugs.push(unit);
    console.log(`ok   ${unit}: ${bodySentences.length} 句 (${v.engine}/${v.voice})`);
    return true;
  } catch (e) {
    console.log(`fail ${unit}: ${e.message}`);
    synthesisFailures.push(`${unit}: ${e.message}`);
    return false;
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

function probeDuration(file, size, bps = 48000) {
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
  return (size * 8) / bps;
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
  // 无 ffprobe 时的码率估算需与该单元的合成参数一致
  const bps = voiceForUnit(unit).engine === "minimax" ? 64000 : 48000;
  for (const f of files) {
    const p = resolve(dir, f);
    starts.push(Number(acc.toFixed(3)));
    const buf = readFileSync(p);
    // 修复失败仍残留的空文件按 0 时长跳过字节,句序与阅读页保持对齐
    if (buf.length > 0) {
      bufs.push(buf);
      acc += probeDuration(p, buf.length, bps);
    }
  }
  starts.push(Number(acc.toFixed(3)));
  writeFileSync(resolve(dir, "full.mp3"), Buffer.concat(bufs));
  manifest.timings ??= {};
  manifest.timings[unit] = starts;
  console.log(`full ${unit}: ${files.length} 句 / ${acc.toFixed(1)}s`);
}

for (const piece of pieces) {
  const maleUnit = `${piece.slug}-m`;
  const hasDualVoiceEvidence =
    manifest.slugs.includes(maleUnit) || existsSync(resolve(AUDIO_DIR, maleUnit));
  const needsNewAudio = !manifest.slugs.includes(piece.slug);
  if (MM_KEY && piece.en) {
    // 双语实验的右上角只承担中/英切换；中文固定使用已选定的 MiniMax 女声。
    await synthesizeUnit(piece.slug, piece.paragraphs, {
      engine: "minimax",
      voice: MM_FEMALE,
    });
  } else if (MM_KEY && (needsNewAudio || hasDualVoiceEvidence)) {
    // 新篇目使用 MiniMax 双声。若上次女声完成、男声只留下半个目录，
    // hasDualVoiceEvidence 会让重跑继续补男声，不会误判成旧的单声文章。
    await synthesizeUnit(piece.slug, piece.paragraphs, {
      engine: "minimax",
      voice: MM_FEMALE,
    });
    await synthesizeUnit(maleUnit, piece.paragraphs, {
      engine: "minimax",
      voice: MM_MALE,
    });
  } else {
    await synthesizeUnit(piece.slug, piece.paragraphs, { engine: "edge", voice: VOICE });
  }
  if (piece.en) {
    await synthesizeUnit(`${piece.slug}-en`, piece.en.paragraphs, {
      engine: "edge",
      voice: EN_VOICE,
    });
  }
}

// 修复用:按音频目录名(slug 或 slug-en)找回句子文本
const textByUnit = new Map();
for (const piece of pieces) {
  textByUnit.set(piece.slug, piece.paragraphs);
  textByUnit.set(`${piece.slug}-m`, piece.paragraphs);
  if (piece.en) textByUnit.set(`${piece.slug}-en`, piece.en.paragraphs);
}

/** 重合成单元里缺失/零字节的句子文件(空文件是偶发合成失败的残留)。 */
async function repairUnit(unit) {
  const paras = textByUnit.get(unit);
  const dir = resolve(AUDIO_DIR, unit);
  if (!paras || !existsSync(dir)) return false;
  const sentences = splitSentences(paras);
  const v = voiceForUnit(unit);
  let repaired = false;
  for (let i = 0; i < sentences.length; i++) {
    const file = resolve(dir, `${i}.mp3`);
    if (existsSync(file) && statSync(file).size > 0) continue;
    try {
      writeFileSync(file, await speak(sentences[i], v));
      console.log(`repair ${unit}/${i} (${v.engine})`);
      repaired = true;
    } catch (e) {
      console.log(`repair fail ${unit}/${i}: ${e.message}`);
      synthesisFailures.push(`${unit}/${i}.mp3: ${e.message}`);
    }
  }
  return repaired;
}

// 先修所有既有单元的缺失/空文件；有修复或尚无时间轴时重建 full.mp3。
// 不能只看 timings：旧逻辑曾把 0 字节句子连同一个看似完整的时间轴一起发布。
for (const unit of manifest.slugs) {
  try {
    const repaired = await repairUnit(unit);
    if (repaired || !manifest.timings?.[unit]) buildFull(unit);
  } catch (e) {
    console.log(`full fail ${unit}: ${e.message}`);
    synthesisFailures.push(`${unit}/full.mp3: ${e.message}`);
  }
}

manifest.voice = VOICE;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`manifest: ${manifest.slugs.length} pieces with audio`);

// 发布闸门：本轮要求生成/续传的每个音频单元，都必须具备完整句文件、
// full.mp3 和逐句时间轴。任何半成品都让工作流失败，禁止再以绿色状态提交。
for (const [unit, paragraphs] of requiredUnits) {
  const expectedCount = splitSentences(paragraphs).length;
  const dir = resolve(AUDIO_DIR, unit);
  const missing = [];
  for (let i = 0; i < expectedCount; i++) {
    const file = resolve(dir, `${i}.mp3`);
    if (!existsSync(file) || statSync(file).size === 0) missing.push(`${i}.mp3`);
  }
  const full = resolve(dir, "full.mp3");
  const timingCount = manifest.timings?.[unit]?.length ?? 0;
  if (!manifest.slugs.includes(unit)) missing.push("manifest");
  if (!existsSync(full) || statSync(full).size === 0) missing.push("full.mp3");
  if (timingCount !== expectedCount + 1) missing.push("timings");
  if (missing.length) {
    synthesisFailures.push(`${unit}: 不完整 (${missing.slice(0, 8).join(", ")})`);
  }
}

if (synthesisFailures.length) {
  throw new Error(
    `音频生成未完整，拒绝发布：\n- ${[...new Set(synthesisFailures)].join("\n- ")}`,
  );
}
