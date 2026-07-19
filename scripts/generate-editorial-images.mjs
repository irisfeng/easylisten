/**
 * 为当天日刊按需生成 0 至 2 张编辑缩略图。
 * 图片失败只跳过，不阻断出刊；现场和敏感新闻由策略层硬性排除。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { normalizeImagePlan } from "./lib/editorial-image-policy.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DAILY = resolve(ROOT, "content/daily.json");
const ARK_API_KEY = process.env.ARK_API_KEY;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const ISSUE_DATE =
  process.env.ISSUE_DATE ||
  new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" });
const ARK_IMAGE_MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-pro-260628";
const DASHSCOPE_IMAGE_MODEL = process.env.DASHSCOPE_IMAGE_MODEL || "wanx-v1";
const DASHSCOPE_API_BASE = (process.env.DASHSCOPE_IMAGE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
const MAX_IMAGES = 2;

if (!ARK_API_KEY && !DASHSCOPE_API_KEY) {
  console.log("未配置 ARK_API_KEY 或 DASHSCOPE_API_KEY，今日不生成编辑缩略图");
  process.exit(0);
}

const selectorProviders = [
  {
    key: process.env.DEEPSEEK_API_KEY,
    base: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    key: DASHSCOPE_API_KEY,
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  {
    key: process.env.OPENAI_API_KEY,
    base: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
];
const selectorProvider = selectorProviders.find((provider) => provider.key);
if (!selectorProvider) {
  console.log("没有可用的文字模型判断配图必要性，今日不生成编辑缩略图");
  process.exit(0);
}
const SELECTOR_MODEL =
  process.env.IMAGE_SELECTOR_MODEL || process.env.LLM_MODEL || selectorProvider.model;

const allPieces = JSON.parse(readFileSync(DAILY, "utf8"));
const todayPieces = allPieces.filter((piece) => piece.publishedAt === ISSUE_DATE);
if (todayPieces.length === 0) {
  console.log(`${ISSUE_DATE} 没有日刊，跳过配图`);
  process.exit(0);
}

const outputDir = resolve(ROOT, "public/editorial", ISSUE_DATE);
mkdirSync(outputDir, { recursive: true });
const existingCount = todayPieces.filter((piece) => {
  if (!piece.image?.src) return false;
  return existsSync(resolve(ROOT, "public", piece.image.src.replace(/^\//, "")));
}).length;

if (existingCount >= MAX_IMAGES) {
  console.log(`本期已有 ${existingCount} 张缩略图，不再生成`);
  process.exit(0);
}

const candidates = todayPieces.filter((piece) => !piece.image?.src);
const planResponse = await fetch(`${selectorProvider.base}/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${selectorProvider.key}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: SELECTOR_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `你是轻听少年刊的视觉编辑。图片只用于目录缩略图，不是新闻现场照片。请从节目单中选择 0 至 ${MAX_IMAGES - existingCount} 篇真正适合配图的内容；没有清晰、可信、可抽象表达的视觉概念就返回空数组。不要选择战争、灾难、犯罪、伤亡、未成年人或其他敏感现场新闻。画面不得出现可识别人物、文字、数字、商标和界面截图。统一采用克制、低饱和、冷灰色调、有纸张质感的当代编辑插图，主体清晰，适合 4:3 小缩略图。`,
      },
      {
        role: "user",
        content: `节目单：\n${candidates.map((piece) => JSON.stringify({ slug: piece.slug, title: piece.title, intro: piece.intro, topics: piece.topics })).join("\n")}\n\n只返回 JSON：{"selections":[{"slug":"必须原样返回","prompt":"具体画面提示词，不超过300字","alt":"客观描述画面，不超过50字","caption":"一句克制图注，不超过30字"}]}`,
      },
    ],
  }),
  signal: AbortSignal.timeout(120000),
});

if (!planResponse.ok) {
  throw new Error(`视觉编辑判断失败: HTTP ${planResponse.status} ${(await planResponse.text()).slice(0, 240)}`);
}
const planJson = await planResponse.json();
const planText = planJson?.choices?.[0]?.message?.content;
if (!planText) throw new Error("视觉编辑没有返回配图计划");
const rawPlan = JSON.parse(planText.replace(/^```json\s*|\s*```$/g, "").trim());
const plan = normalizeImagePlan(rawPlan, candidates, existingCount, MAX_IMAGES);

if (plan.length === 0) {
  console.log("视觉编辑判断本期无需配图");
  process.exit(0);
}

for (const item of plan) {
  try {
    const prompt = [
      item.prompt,
      "当代杂志编辑插图，冷灰低饱和，柔和自然光，真实材质与轻微纸张颗粒，构图简洁，主体位于画面中央，适合裁成4比3缩略图。",
      "不出现人物面孔、文字、字母、数字、标志、水印、新闻摄影效果。",
    ].join(" ").slice(0, 780);
    const imageUrl = await generateImage(prompt);
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(60000) });
    if (!imageResponse.ok) throw new Error(`下载图片 HTTP ${imageResponse.status}`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length > 15 * 1024 * 1024) throw new Error("图片超过 15MB");

    const fileName = `${item.piece.slug}.webp`;
    const filePath = resolve(outputDir, fileName);
    await sharp(buffer)
      .resize(640, 480, { fit: "cover", position: "attention" })
      .modulate({ saturation: 0.58, brightness: 1.02 })
      .webp({ quality: 78, effort: 5 })
      .toFile(filePath);

    item.piece.image = {
      src: `/editorial/${ISSUE_DATE}/${fileName}`,
      alt: item.alt,
      caption: item.caption,
      kind: "editorial",
    };
    console.log(`已生成缩略图: ${item.piece.title}`);
  } catch (error) {
    console.log(`缩略图生成失败，跳过《${item.piece.title}》: ${error.message}`);
  }
}

writeFileSync(DAILY, `${JSON.stringify(allPieces, null, 2)}\n`);

async function generateImage(prompt) {
  if (ARK_API_KEY) {
    try {
      return await generateArkImage(prompt);
    } catch (error) {
      if (!DASHSCOPE_API_KEY) throw error;
      console.log(`方舟生图失败，改用百炼兜底: ${error.message}`);
    }
  }
  return generateDashScopeImage(prompt);
}

async function generateArkImage(prompt) {
  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ARK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ARK_IMAGE_MODEL,
      prompt,
      size: "2K",
      stream: false,
      response_format: "url",
      watermark: false,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    throw new Error(`方舟生图 HTTP ${response.status} ${(await response.text()).slice(0, 240)}`);
  }
  const result = await response.json();
  const url = result?.data?.find((item) => item.url)?.url;
  if (!url) throw new Error("方舟生图成功但没有下载地址");
  return url;
}

async function generateDashScopeImage(prompt) {
  const createResponse = await fetch(`${DASHSCOPE_API_BASE}/services/aigc/text2image/image-synthesis`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      "content-type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: DASHSCOPE_IMAGE_MODEL,
      input: {
        prompt,
        negative_prompt: "文字，字母，数字，商标，水印，人物面孔，新闻摄影，过饱和，卡通，低清晰度，畸形",
      },
      parameters: { style: "<auto>", size: "1024*1024", n: 1 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!createResponse.ok) {
    throw new Error(`创建图片任务 HTTP ${createResponse.status} ${(await createResponse.text()).slice(0, 200)}`);
  }
  const created = await createResponse.json();
  const taskId = created?.output?.task_id;
  if (!taskId) throw new Error(`创建图片任务失败: ${created?.message ?? "无 task_id"}`);

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 4000));
    const statusResponse = await fetch(`${DASHSCOPE_API_BASE}/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${DASHSCOPE_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!statusResponse.ok) throw new Error(`查询图片任务 HTTP ${statusResponse.status}`);
    const status = await statusResponse.json();
    const state = status?.output?.task_status;
    if (state === "SUCCEEDED") {
      const url = status?.output?.results?.find((result) => result.url)?.url;
      if (!url) throw new Error("图片任务成功但没有下载地址");
      return url;
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(state)) {
      throw new Error(status?.output?.message || `图片任务状态 ${state}`);
    }
  }
  throw new Error("图片任务超过 120 秒");
}
