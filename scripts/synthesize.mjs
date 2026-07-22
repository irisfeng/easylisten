/**
 * 预生成神经语音:为每篇没有音频的听稿逐句合成 MP3,
 * 写入 public/audio/<slug>/<句序>.mp3,并更新 public/audio/manifest.json。
 *
 * 正式工作流按产品音频契约生成音轨：纯中文稿为 MiniMax 男女双声；
 * 中英双语稿为 MiniMax 中文女声与 Edge 英文女声：
 *   node scripts/synthesize.mjs
 *
 * 按句分文件与播放器的句级模型天然对齐:高亮、跳句、点句播放都无需时间轴。
 * 本地未配置 key 时可用 Edge 做开发兜底；REQUIRE_AUDIO_CONTRACT=true 的
 * 正式工作流禁止兜底，规定音轨不完整就拒绝发布。
 */

import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import {
  buildMiniMaxTextOptions,
  buildPronunciationDictionary,
  normalizeForSpeech,
  splitSentences,
} from "../src/lib/speech-text.js";
import { synthesizeWithRetries } from "./lib/tts-recovery.mjs";
import {
  miniMaxBillingChars,
  miniMaxCharsForTracks,
} from "./lib/audio-budget.mjs";
import {
  CHINESE_FEMALE_VOICE,
  CHINESE_MALE_VOICE,
  ENGLISH_FEMALE_VOICE,
  audioPlanForPiece,
  latestIssuePieces,
  missingRequiredAudioUnits,
} from "./lib/audio-policy.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const AUDIO_DIR = resolve(ROOT, "public/audio");
const MANIFEST = resolve(AUDIO_DIR, "manifest.json");
const PRONUNCIATIONS = JSON.parse(
  readFileSync(resolve(ROOT, "content/pronunciations.json"), "utf8"),
);
const VOICE = "zh-CN-XiaoxiaoNeural";
const EN_VOICE = ENGLISH_FEMALE_VOICE;
const EN_FALLBACK_VOICE = "en-US-JennyNeural";
const EDGE_ATTEMPTS_PER_VOICE = Math.max(
  1,
  Number(process.env.EDGE_TTS_ATTEMPTS_PER_VOICE || 3),
);
const EDGE_RETRY_BASE_MS = Math.max(0, Number(process.env.EDGE_TTS_RETRY_BASE_MS || 1200));
// 修改朗读规范时递增。已有 MiniMax 音频只重合成实际受新规则影响的句子，
// 页面正文不变；版本记入 manifest，避免每日任务重复消耗额度。
const SPEECH_TEXT_VERSION = 2;
const NUMBER_NORMALIZATION_VERSION = 1;
const PRONUNCIATION_DICTIONARY_VERSION = 2;

// 产品音频契约：纯中文稿生成 MiniMax 女声(<slug>)和男声(<slug>-m)；
// 中英双语稿生成 MiniMax 中文女声(<slug>)和 Edge 英文女声(<slug>-en)。
// 未配置 key 时仅允许本地开发回落 Edge；正式工作流会在付费前失败。
const MM_KEY = process.env.MINIMAX_API_KEY;
const MM_FEMALE = CHINESE_FEMALE_VOICE;
const MM_MALE = CHINESE_MALE_VOICE;
const REQUIRE_AUDIO_CONTRACT = process.env.REQUIRE_AUDIO_CONTRACT === "true";
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
// 付费硬上限：无论选稿或修复逻辑如何变化，本轮传给 MiniMax 的文本总量都不能
// 超过该值。正式双声工作流默认 12000 字符并在付费前整体预检；本地非正式运行
// 仍可在单篇放不进预算时整篇使用免费 Edge，避免混合音色。
const MM_MAX_CHARS_PER_RUN = Math.max(
  0,
  Number(process.env.MINIMAX_MAX_CHARS_PER_RUN || 12000),
);
let mmCharsRequested = 0;
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

function budgetedVoiceForUnit(unit, paragraphs, preferredVoice) {
  if (preferredVoice.engine !== "minimax") return preferredVoice;
  const billedChars = splitSentences(paragraphs).reduce((total, sentence) => {
    const text = speechTextForUnit(sentence, unit);
    return total + (/[\p{L}\p{N}]/u.test(text) ? miniMaxBillingChars(text) : 0);
  }, 0);
  if (mmCharsRequested + billedChars <= MM_MAX_CHARS_PER_RUN) return preferredVoice;
  if (REQUIRE_AUDIO_CONTRACT) {
    throw new Error(
      `MiniMax 音频契约成本闸门：${unit} 需要 ${billedChars} 字符，` +
        `本轮已使用 ${mmCharsRequested}/${MM_MAX_CHARS_PER_RUN}；拒绝降级或发布不完整版本`,
    );
  }
  console.log(
    `budget ${unit}: MiniMax 预计 ${billedChars} 字符，剩余 ` +
      `${MM_MAX_CHARS_PER_RUN - mmCharsRequested}；整篇改用免费 Edge 语音`,
  );
  return {
    engine: "edge",
    voice: unit.endsWith("-m") ? "zh-CN-YunxiNeural" : VOICE,
  };
}

async function synthesizeMiniMaxWith(text, voiceId, model) {
  const billedChars = miniMaxBillingChars(text);
  if (mmCharsRequested + billedChars > MM_MAX_CHARS_PER_RUN) {
    throw new Error(
      `MiniMax 成本闸门：本轮最多 ${MM_MAX_CHARS_PER_RUN} 字符，` +
        `当前已请求 ${mmCharsRequested}，下一段 ${billedChars}；已停止付费调用`,
    );
  }
  mmCharsRequested += billedChars;
  await waitForMiniMaxSlot();
  const textOptions = buildMiniMaxTextOptions(text, PRONUNCIATIONS.zh);
  const res = await fetch(
    `https://api.minimaxi.com/v1/t2a_v2${MM_GROUP_ID ? `?GroupId=${MM_GROUP_ID}` : ""}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MM_KEY}` },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        ...textOptions,
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
  if (unit.endsWith("-en")) {
    return { engine: "edge", voice: manifest.edgeVoices?.[unit] ?? EN_VOICE };
  }
  if (unit.endsWith("-m")) return { engine: "minimax", voice: MM_MALE };
  // 基础中文单元固定 MiniMax 女声；存在 -m 兄弟目录的是双声篇。
  // 判断不能依赖本机是否配置 key，否则修复旧音频时会悄悄换回 Edge 音色。
  if (miniMaxFemaleUnits.has(unit) || existsSync(resolve(AUDIO_DIR, `${unit}-m`))) {
    return { engine: "minimax", voice: MM_FEMALE };
  }
  return { engine: "edge", voice: VOICE };
}

function speechTextForUnit(text, unit) {
  return normalizeForSpeech(text, unit.endsWith("-en") ? "en" : "zh");
}

const dailyPieces = JSON.parse(
  readFileSync(resolve(ROOT, "content/daily.json"), "utf8"),
);
const seedPieces = JSON.parse(
  readFileSync(resolve(ROOT, "content/seeds.json"), "utf8"),
);
const allPieces = [...dailyPieces, ...seedPieces];
const targetSlugs = new Set(
  String(process.env.TARGET_AUDIO_SLUGS ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean),
);
const knownSlugs = new Set(allPieces.map((piece) => piece.slug));
const unknownTargets = [...targetSlugs].filter((slug) => !knownSlugs.has(slug));
if (unknownTargets.length) {
  throw new Error(`指定音频稿件不存在：${unknownTargets.join("、")}`);
}
const pieces = targetSlugs.size
  ? allPieces.filter((piece) => targetSlugs.has(piece.slug))
  : latestIssuePieces(dailyPieces);

if (!targetSlugs.size) {
  console.log(
    `最新一期音频契约：${pieces[0]?.publishedAt ?? "无日期"} / ${pieces.length} 篇；` +
      "历史稿不追溯付费生成",
  );
}

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : { voice: VOICE, slugs: [] };
const synthesisFailures = [];
const requiredUnits = new Map();
const miniMaxFemaleUnits = new Set(pieces.map((piece) => piece.slug));

if (REQUIRE_AUDIO_CONTRACT && !MM_KEY) {
  throw new Error("正式音频工作流缺少 MINIMAX_API_KEY，拒绝回落或发布不完整音轨");
}

if (targetSlugs.size && process.env.FORCE_TARGET_AUDIO === "true") {
  for (const slug of targetSlugs) {
    const piece = pieces.find((entry) => entry.slug === slug);
    for (const { unit } of audioPlanForPiece(piece)) {
      rmSync(resolve(AUDIO_DIR, unit), { recursive: true, force: true });
      manifest.slugs = manifest.slugs.filter((entry) => entry !== unit);
      if (manifest.timings) delete manifest.timings[unit];
      if (manifest.speechTextVersions) delete manifest.speechTextVersions[unit];
      if (manifest.edgeVoices) delete manifest.edgeVoices[unit];
    }
    console.log(`force ${slug}: 按文章类型清除旧音轨，按已审核正文重新生成`);
  }
}

// 正式工作流先计算本轮缺失 MiniMax 音轨的总成本。Edge 英文轨免费，不计入
// MiniMax 字符预算。超限时在第一次付费调用前失败，不留下半套音频。
if (REQUIRE_AUDIO_CONTRACT) {
  const missingTracks = missingRequiredAudioUnits(pieces, manifest.slugs);
  const estimatedChars = miniMaxCharsForTracks(missingTracks);
  console.log(
    `音频契约预检：待生成 ${missingTracks.length} 条音轨，` +
      `MiniMax 预计 ${estimatedChars}/${MM_MAX_CHARS_PER_RUN} 字符`,
  );
  if (estimatedChars > MM_MAX_CHARS_PER_RUN) {
    throw new Error(
      `MiniMax 音频契约成本预检超限：预计 ${estimatedChars}/${MM_MAX_CHARS_PER_RUN} 字符；` +
        "尚未发起付费请求，请缩短稿件或显式调整预算",
    );
  }
}

async function synthesizeEdgeAttempt(text, voice) {
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

async function synthesize(text, voice = VOICE) {
  const result = await synthesizeWithRetries({
    voices: [voice],
    attemptsPerVoice: EDGE_ATTEMPTS_PER_VOICE,
    baseDelayMs: EDGE_RETRY_BASE_MS,
    synthesizeAttempt: (candidateVoice) => synthesizeEdgeAttempt(text, candidateVoice),
  });
  if (result.attempt > 1) {
    console.log(`edge/${voice} 第 ${result.attempt} 次尝试成功`);
  }
  return result.audio;
}

function clearUnitAudio(unit) {
  const dir = resolve(AUDIO_DIR, unit);
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (/^\d+\.mp3$/.test(file) || file === "full.mp3") {
      rmSync(resolve(dir, file), { force: true });
    }
  }
  if (manifest.timings) delete manifest.timings[unit];
}

async function synthesizeEdgeUnit(unit, bodySentences, preferredVoice) {
  // 上一轮若在备用音色中途失败，manifest 会记录该音色；续传时必须沿用，
  // 否则已有句子与新补句子会混用不同声音。
  const resumableVoice = manifest.edgeVoices?.[unit] ?? preferredVoice;
  const voices = [
    resumableVoice,
    ...(unit.endsWith("-en") && resumableVoice !== EN_FALLBACK_VOICE
      ? [EN_FALLBACK_VOICE]
      : []),
  ];
  const failures = [];
  for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex++) {
    const voice = voices[voiceIndex];
    // 一旦主音色持续失败，整条音轨统一重做为备用女声，避免句间混音色。
    if (voiceIndex > 0) {
      clearUnitAudio(unit);
      console.log(`edge 单元降级 ${unit}: ${resumableVoice} → ${voice}`);
    }
    // 在开始写句文件前记录实际音色；即使本轮中途失败，下一进程也能同音色续传。
    manifest.edgeVoices ??= {};
    manifest.edgeVoices[unit] = voice;
    try {
      for (let i = 0; i < bodySentences.length; i++) {
        const file = resolve(AUDIO_DIR, unit, `${i}.mp3`);
        if (existsSync(file) && statSync(file).size > 0) continue;
        writeFileSync(
          file,
          await synthesize(speechTextForUnit(bodySentences[i], unit), voice),
        );
      }
      return voice;
    } catch (error) {
      failures.push(`${voice}: ${error.message}`);
    }
  }
  throw new Error(`Edge 音轨生成失败：${failures.join("；")}`);
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
    let actualVoice = v.voice;
    if (v.engine === "edge") {
      actualVoice = await synthesizeEdgeUnit(unit, bodySentences, v.voice);
    } else {
      for (let i = 0; i < bodySentences.length; i++) {
        const file = resolve(dir, `${i}.mp3`);
        // 零字节视同缺失:合成偶发静默失败留下的空文件要重新合成
        if (existsSync(file) && statSync(file).size > 0) continue;
        writeFileSync(file, await speak(speechTextForUnit(bodySentences[i], unit), v));
      }
    }
    manifest.speechTextVersions ??= {};
    manifest.speechTextVersions[unit] = SPEECH_TEXT_VERSION;
    manifest.slugs.push(unit);
    console.log(`ok   ${unit}: ${bodySentences.length} 句 (${v.engine}/${actualVoice})`);
    return true;
  } catch (e) {
    console.log(`fail ${unit}: ${e.message}`);
    synthesisFailures.push(`${unit}: ${e.message}`);
    return false;
  }
}

/**
 * 整篇拼接:把 <unit>/ 下的逐句 MP3 按序封装成 full.mp3,并用 ffprobe 量出
 * 每句时长写入 manifest.timings(累计起点秒,末位为总时长)。
 * 播放器据此单文件连续播放——句间零停顿,高亮与点句跳转靠时间轴反查。
 *
 * 不能 Buffer.concat MP3 字节:那会保留每句各自的 ID3/Xing 头，Safari 的
 * duration/seek 表会失真，表现为点句回到开头、高亮很快失步。ffmpeg concat
 * demuxer 先按句序解码，再编码为一个带完整 Xing seek 表的连续 MP3。仅做
 * stream copy 在 Chrome/Safari 中仍可能跳到错误位置；单流编码不改变选定音色。
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
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_frames",
        "-show_streams",
        "-show_entries",
        "stream=sample_rate:frame=nb_samples",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    );
    const data = JSON.parse(out);
    const sampleRate = Number(data.streams?.[0]?.sample_rate);
    const samples = (data.frames ?? []).reduce(
      (sum, frame) => sum + Number(frame.nb_samples ?? 0),
      0,
    );
    const d = samples / sampleRate;
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
  let acc = 0;
  // 无 ffprobe 时的码率估算需与该单元的合成参数一致
  const bps = voiceForUnit(unit).engine === "minimax" ? 64000 : 48000;
  for (const f of files) {
    const p = resolve(dir, f);
    starts.push(Number(acc.toFixed(3)));
    const size = statSync(p).size;
    // 修复失败仍残留的空文件按 0 时长跳过字节,句序与阅读页保持对齐
    if (size > 0) {
      acc += probeDuration(p, size, bps);
    }
  }
  starts.push(Number(acc.toFixed(3)));

  const workDir = mkdtempSync(resolve(tmpdir(), "easylisten-full-"));
  try {
    const concatFile = resolve(workDir, "concat.txt");
    const output = resolve(workDir, "full.mp3");
    const lines = files
      .filter((f) => statSync(resolve(dir, f)).size > 0)
      .map((f) => `file '${resolve(dir, f).replace(/'/g, "'\\''")}'`)
      .join("\n");
    writeFileSync(concatFile, `${lines}\n`);
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatFile,
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${Math.round(bps / 1000)}k`,
        "-ar",
        "32000",
        "-ac",
        "1",
        "-write_xing",
        "1",
        "-y",
        output,
      ],
      { stdio: "inherit" },
    );
    copyFileSync(output, resolve(dir, "full.mp3"));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  manifest.timings ??= {};
  manifest.timings[unit] = starts;
  console.log(`full ${unit}: ${files.length} 句 / ${acc.toFixed(1)}s`);
}

for (const piece of pieces) {
  if (MM_KEY) {
    for (const track of audioPlanForPiece(piece)) {
      const preferredVoice = { engine: track.engine, voice: track.voice };
      await synthesizeUnit(
        track.unit,
        track.paragraphs,
        budgetedVoiceForUnit(track.unit, track.paragraphs, preferredVoice),
      );
    }
  } else {
    await synthesizeUnit(piece.slug, piece.paragraphs, { engine: "edge", voice: VOICE });
  }
}

// 修复用:按产品音频契约找回每条音轨对应的文本
const textByUnit = new Map();
for (const piece of pieces) {
  for (const track of audioPlanForPiece(piece)) {
    textByUnit.set(track.unit, track.paragraphs);
  }
}

/** 重合成单元里缺失/零字节的句子文件(空文件是偶发合成失败的残留)。 */
async function repairUnit(unit) {
  const paras = textByUnit.get(unit);
  const dir = resolve(AUDIO_DIR, unit);
  if (!paras || !existsSync(dir)) return false;
  const sentences = splitSentences(paras);
  const speechSentences = sentences.map((sentence) => speechTextForUnit(sentence, unit));
  const pronunciationRules = speechSentences.map((sentence) =>
    buildPronunciationDictionary(sentence, PRONUNCIATIONS.zh),
  );
  const v = voiceForUnit(unit);
  const numericFiles = readdirSync(dir).filter((file) => /^\d+\.mp3$/.test(file));
  const timingCount = manifest.timings?.[unit]?.length;
  const sentenceCountDrift =
    numericFiles.length !== sentences.length ||
    (timingCount !== undefined && timingCount !== sentences.length + 1);
  const currentSpeechTextVersion = Number(manifest.speechTextVersions?.[unit] ?? 0);
  const sentenceNeedsFeatureUpgrade = sentences.map(
    (sentence, i) =>
      (currentSpeechTextVersion < NUMBER_NORMALIZATION_VERSION &&
        speechSentences[i] !== sentence) ||
      (currentSpeechTextVersion < PRONUNCIATION_DICTIONARY_VERSION &&
        pronunciationRules[i].length > 0),
  );
  const needsSpeechTextUpgrade =
    v.engine === "minimax" && sentenceNeedsFeatureUpgrade.some(Boolean);
  let repaired = false;
  let complete = true;
  for (let i = 0; i < sentences.length; i++) {
    const file = resolve(dir, `${i}.mp3`);
    const needsRewrite =
      sentenceCountDrift ||
      (needsSpeechTextUpgrade && sentenceNeedsFeatureUpgrade[i]) ||
      !existsSync(file) ||
      statSync(file).size === 0;
    if (!needsRewrite) continue;
    try {
      writeFileSync(file, await speak(speechSentences[i], v));
      console.log(`repair ${unit}/${i} (${v.engine})`);
      repaired = true;
    } catch (e) {
      console.log(`repair fail ${unit}/${i}: ${e.message}`);
      synthesisFailures.push(`${unit}/${i}.mp3: ${e.message}`);
      complete = false;
    }
  }
  if (complete) {
    for (const file of numericFiles) {
      if (Number.parseInt(file, 10) >= sentences.length) {
        rmSync(resolve(dir, file), { force: true });
        repaired = true;
      }
    }
    manifest.speechTextVersions ??= {};
    manifest.speechTextVersions[unit] = SPEECH_TEXT_VERSION;
  }
  return repaired;
}

// fullAudioVersion=4 代表带完整 seek 表的单一编码流，时间轴按解码后的 PCM
// 样本数计算，排除每个逐句 MP3 自带的 encoder delay/padding。
// 必须一次性迁移，否则 iOS 锁屏虽能看到播放器，点句和高亮仍会失真。
const FULL_AUDIO_VERSION = 4;
const needsFullAudioMigration = manifest.fullAudioVersion !== FULL_AUDIO_VERSION;

// 先修所有既有单元的缺失/空文件；有修复、尚无时间轴或格式待迁移时重建。
// 不能只看 timings：旧逻辑曾把 0 字节句子连同一个看似完整的时间轴一起发布。
for (const unit of manifest.slugs) {
  try {
    const repaired = await repairUnit(unit);
    if (repaired || !manifest.timings?.[unit] || needsFullAudioMigration) {
      buildFull(unit);
    }
  } catch (e) {
    console.log(`full fail ${unit}: ${e.message}`);
    synthesisFailures.push(`${unit}/full.mp3: ${e.message}`);
  }
}

manifest.voice = VOICE;
manifest.fullAudioVersion = FULL_AUDIO_VERSION;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`manifest: ${manifest.slugs.length} pieces with audio`);
if (MM_KEY) {
  console.log(
    `MiniMax 本轮请求 ${mmCharsRequested}/${MM_MAX_CHARS_PER_RUN} 字符（硬上限）`,
  );
}

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
