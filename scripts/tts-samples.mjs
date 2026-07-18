/**
 * 音色盲选小样:用同一段真实听稿,把已配 key 的各家超拟人 TTS 各合成
 * 几个音色,匿名编号写入 public/tts-samples/(含试听页 index.html)。
 * "样品编号 → 服务商/音色"的对照表只打印在运行日志里,保证盲听。
 *
 * 在 GitHub Actions 的「音色小样」工作流中手动触发;任何一家失败只记日志。
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const TEXT =
  "你大概在超市里见过那个绿叶标志的塑料盒——Driscoll's,美国超市里第二赚钱的品牌,仅次于可口可乐。这家公司几乎垄断了浆果世界,但它究竟是怎么做到的?";

const OUT = resolve(import.meta.dirname, "../public/tts-samples");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const results = [];

async function attempt(label, fn) {
  try {
    await fn();
    console.log(`ok   ${label}`);
  } catch (e) {
    console.log(`fail ${label}: ${e.message}`);
  }
}

/* —— MiniMax(国内版):GroupId 藏在 JWT key 的载荷里,解出来带上 —— */
const MM = process.env.MINIMAX_API_KEY;
if (MM) {
  const gid = (() => {
    try {
      const payload = JSON.parse(Buffer.from(MM.split(".")[1], "base64").toString());
      return payload.GroupID ?? payload.group_id ?? "";
    } catch {
      return "";
    }
  })();
  // 第二轮:男声已定(male-qn-jingying),专场盲选女声;与男声同厂保证质感一致
  for (const voice of [
    "female-yujie",
    "female-tianmei",
    "female-shaonv",
    "presenter_female",
    "audiobook_female_2",
  ]) {
    await attempt(`minimax/${voice}`, async () => {
      const res = await fetch(
        `https://api.minimaxi.com/v1/t2a_v2${gid ? `?GroupId=${gid}` : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${MM}` },
          body: JSON.stringify({
            model: "speech-02-hd",
            text: TEXT,
            stream: false,
            voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const json = await res.json();
      const hex = json?.data?.audio;
      if (!hex) {
        throw new Error(`HTTP ${res.status} ${JSON.stringify(json?.base_resp ?? json).slice(0, 200)}`);
      }
      results.push({ provider: "minimax", voice, ext: "mp3", buf: Buffer.from(hex, "hex") });
    });
  }
}

/* —— 阿里百炼 qwen-tts(HTTP 直连,CosyVoice 需 WebSocket,小样阶段先用它) —— */
const DS = process.env.SAMPLE_ALL ? process.env.DASHSCOPE_API_KEY : "";
if (DS) {
  for (const voice of ["Cherry", "Serena", "Dylan"]) {
    await attempt(`qwen-tts/${voice}`, async () => {
      const res = await fetch(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
          body: JSON.stringify({ model: "qwen-tts-latest", input: { text: TEXT, voice } }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const json = await res.json();
      const url = json?.output?.audio?.url;
      if (!url) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
      const audio = await fetch(url, { signal: AbortSignal.timeout(60000) });
      results.push({
        provider: "qwen-tts",
        voice,
        ext: "wav",
        buf: Buffer.from(await audio.arrayBuffer()),
      });
    });
  }
}

/* —— 阶跃星辰(OpenAI 兼容 audio/speech 接口) —— */
const SF = process.env.SAMPLE_ALL ? (process.env.STEPFUN_API_KEYS || process.env.STEPFUN_API_KEY) : "";
if (SF) {
  for (const voice of ["cixingnansheng", "wenrounvsheng", "qingchunshaonv"]) {
    await attempt(`stepfun/${voice}`, async () => {
      const res = await fetch("https://api.stepfun.com/v1/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${SF}` },
        body: JSON.stringify({ model: "step-tts-mini", input: TEXT, voice }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      results.push({
        provider: "stepfun",
        voice,
        ext: "mp3",
        buf: Buffer.from(await res.arrayBuffer()),
      });
    });
  }
}

/* —— 火山引擎豆包(大模型语音合成 v3,流式 JSON 行,音频为 base64 分片) —— */
const VK = process.env.SAMPLE_ALL ? process.env.VOLC_API_KEY : "";
if (VK) {
  for (const speaker of ["zh_female_shuangkuaisisi_moon_bigtts", "zh_male_yunzhou_jupiter_bigtts"]) {
    await attempt(`volcano/${speaker}`, async () => {
      const res = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${VK}`,
          "x-api-resource-id": "volc.service_type.10029",
        },
        body: JSON.stringify({
          req_params: {
            text: TEXT,
            speaker,
            audio_params: { format: "mp3", sample_rate: 24000 },
          },
        }),
        signal: AbortSignal.timeout(60000),
      });
      const bodyText = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${bodyText.slice(0, 200)}`);
      const chunks = [];
      for (const line of bodyText.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t);
          if (typeof j.data === "string" && j.data) chunks.push(Buffer.from(j.data, "base64"));
        } catch {
          /* 非 JSON 行忽略 */
        }
      }
      if (!chunks.length) throw new Error(`无音频分片: ${bodyText.slice(0, 200)}`);
      results.push({ provider: "volcano", voice: speaker, ext: "mp3", buf: Buffer.concat(chunks) });
    });
  }
}

/* —— 现状对照组:Edge 晓晓(免费,当前线上音色) —— */
if (process.env.SAMPLE_ALL) await attempt("edge/xiaoxiao", async () => {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata("zh-CN-XiaoxiaoNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(TEXT);
    const chunks = [];
    for await (const c of audioStream) chunks.push(c);
    results.push({ provider: "edge", voice: "xiaoxiao", ext: "mp3", buf: Buffer.concat(chunks) });
  } finally {
    tts.close();
  }
});

if (results.length === 0) {
  console.log("没有任何一家合成成功,检查各 key 与接口报错");
  process.exit(1);
}

/* —— 匿名编号(洗牌),对照表只进日志 —— */
for (let i = results.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [results[i], results[j]] = [results[j], results[i]];
}
const items = results.map((r, i) => {
  const file = `sample-${i + 1}.${r.ext}`;
  writeFileSync(resolve(OUT, file), r.buf);
  return { n: i + 1, file };
});

console.log("\n===== 盲听对照表(仅日志可见)=====");
results.forEach((r, i) => console.log(`样品 ${i + 1} → ${r.provider}/${r.voice}`));

const html = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>轻听 · 音色盲选</title>
<style>
  body{max-width:40rem;margin:0 auto;padding:3rem 1.5rem;background:#f7f6f3;color:#141413;font-family:ui-sans-serif,system-ui,sans-serif}
  h1{font-family:ui-serif,Georgia,serif;font-weight:600;letter-spacing:-.02em}
  p{color:#787774;line-height:1.7}
  .s{border-bottom:1px solid #eaeaea;padding:1.2rem 0}
  .n{font-family:ui-monospace,monospace;font-size:.8rem;letter-spacing:.15em;color:#a8a49e}
  audio{width:100%;margin-top:.6rem}
</style>
<h1>音色盲选</h1>
<p>同一段今日听稿,不同的声音。别管是哪家的——只选你愿意每天听的那一个,把编号告诉我。</p>
${items.map((it) => `<div class="s"><span class="n">样品 ${it.n}</span><audio controls preload="none" src="/tts-samples/${it.file}"></audio></div>`).join("\n")}
`;
writeFileSync(resolve(OUT, "index.html"), html);
console.log(`\n${items.length} 个样品 → public/tts-samples/`);
