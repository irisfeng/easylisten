/**
 * 精选:读取 content/candidates.json,按 content/rubric.md 评分,
 * 把入选文章改写成中文听稿,追加进 content/daily.json。
 *
 * 模型走 OpenAI 兼容接口,自动识别以下任一 key(GitHub Actions 中配为 secret):
 *   - DEEPSEEK_API_KEY   → DeepSeek(deepseek-chat)
 *   - DASHSCOPE_API_KEY  → 阿里百炼(qwen-plus)
 *   - OPENAI_API_KEY     → 任意 OpenAI 兼容服务(需另配 LLM_BASE_URL)
 * 可用 LLM_MODEL / LLM_BASE_URL 覆盖默认模型与地址。
 *
 *   node scripts/ingest.mjs && node scripts/curate.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const RUBRIC = readFileSync(resolve(ROOT, "content/rubric.md"), "utf8");
const CANDIDATES = JSON.parse(readFileSync(resolve(ROOT, "content/candidates.json"), "utf8"));
const DAILY = resolve(ROOT, "content/daily.json");

const PICKS_PER_DAY = 4;

// —— 模型服务解析:按已配置的 key 自动选择 OpenAI 兼容服务商 ——
const PROVIDERS = [
  { env: "DEEPSEEK_API_KEY", base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { env: "DASHSCOPE_API_KEY", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  // 通用 OpenAI 兼容服务:base 由 LLM_BASE_URL 显式给定
  { env: "OPENAI_API_KEY", base: process.env.LLM_BASE_URL || "https://api.openai.com/v1", model: "gpt-4o-mini" },
];
const provider = PROVIDERS.find((p) => process.env[p.env]);
if (!provider) {
  throw new Error(
    "未找到模型 key:请在 GitHub Secrets 配置 DEEPSEEK_API_KEY 或 DASHSCOPE_API_KEY",
  );
}
const LLM_KEY = process.env[provider.env];
// base 始终绑定到选中的服务商,杜绝把某家的 key 发到另一家的端点;
// LLM_MODEL 覆盖只换模型名(同一端点),不改地址
const LLM_BASE = provider.base;
const MODEL = process.env.LLM_MODEL || provider.model;
console.log(`模型服务: ${provider.env} → ${MODEL} @ ${LLM_BASE}`);

/**
 * 调用 OpenAI 兼容的 /chat/completions,强制 JSON 输出并解析。
 * DeepSeek 与百炼均支持 response_format:{type:"json_object"}(提示里需含 "json")。
 */
async function chatJson(system, user, label) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const choice = json?.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error(`${label}: 输出被 max_tokens 截断,本次不出刊`);
  }
  const text = choice?.message?.content;
  if (!text) throw new Error(`${label}: 响应中没有内容`);
  // 个别模型会用 ```json 包裹,去壳后再解析
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  // 有的模型会在字符串里塞入未转义的裸控制字符(如换行),JSON.parse 会拒绝。
  // 合法 JSON 里控制字符只作为词法记号间的空白出现,或以 \n 形式转义(两个字符);
  // 因此把裸控制字符统一替换为空格,既修复串内非法字符,又不影响结构与已转义序列。
  const safe = Array.from(cleaned, (ch) => (ch.charCodeAt(0) < 0x20 ? " " : ch)).join("");
  return JSON.parse(safe);
}

// 日刊按北京日历日期落款(定时任务在 UTC 22:00 = 北京次日早 6 点运行)
const today =
  process.env.ISSUE_DATE ||
  new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" });

// 编排规则:连续 3 天缺席的领域提权,先从近三期日刊统计覆盖情况
const existing = existsSync(DAILY) ? JSON.parse(readFileSync(DAILY, "utf8")) : [];
const recentCats = new Set(
  existing
    .filter((p) => Date.now() - Date.parse(p.publishedAt) < 3 * 24 * 3600 * 1000)
    .map((p) => p.category),
);
const ALL_CATS = ["science", "tech", "society", "humanities", "living", "culture"];
const starved = ALL_CATS.filter((c) => !recentCats.has(c));

// 第一步:全量评分,选出今日入选名单(结构化输出保证可解析)。
const menu = CANDIDATES.map(
  (c, i) =>
    `[${i}] (${c.category}/${c.sourceName}${c.resonance > 1 ? `/共振x${c.resonance}` : ""}) ${c.title}\n${c.summary.slice(0, 400)}`,
).join("\n\n");

const scoreResult = await chatJson(
  `你是"轻听"的主编。严格按下面的评分标准与编排规则挑选内容,宁缺毋滥。\n\n${RUBRIC}`,
  `以下是今天的候选池。为每篇打分,并按编排规则选出今天的 ${PICKS_PER_DAY} 篇节目单(同一领域最多 2 篇,质量优先)。${starved.length ? `近三天未覆盖的领域(同分时优先):${starved.join("、")}。` : ""}
category 从这六个里选:science、tech、society、humanities、living、culture。
topics 从这个列表里选:航天与宇宙、生命与演化、物质与数学、脑与认知、AI 与计算、工程与制造、互联网产品、数字生活、全球时事、经济与商业、城市与公共、气候与能源、历史、哲学与思想、艺术与设计、阅读与写作、健康与医学、心理与情绪、食物与日常、出行与旅行、音乐、影视与游戏、流行与网络文化、体育。

以 JSON 返回,格式为 {"picks": [{"index": 候选序号(整数), "score": 分数(整数), "category": 领域, "topics": [话题], "reason": "一句话理由"}]}。

${menu}`,
  "评分",
);
const picks = scoreResult.picks;
const indexes = Array.isArray(picks) ? picks.map((p) => p.index) : [];
const validPicks =
  indexes.length === PICKS_PER_DAY &&
  indexes.every((i) => Number.isInteger(i) && i >= 0 && i < CANDIDATES.length) &&
  new Set(indexes).size === indexes.length;
if (!validPicks) throw new Error("评分:未返回有效且唯一的 picks");
console.log(`selected ${picks.length}:`, picks.map((p) => `[${p.index}] ${p.score}`).join(", "));

/**
 * 用 Firecrawl Keyless 抓取入选文章全文(Markdown)。
 * 免费额度每月 1000 次、无需 API key,每日只抓入选的几篇,绰绰有余。
 * 任何失败都返回 null,听稿回落到"仅基于 RSS 摘要"的原有模式。
 */
async function fetchFullText(url) {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // 兼容 {data:{markdown}} 与 {markdown} 两种响应形态
    const md = json?.data?.markdown ?? json?.markdown;
    return typeof md === "string" && md.trim().length > 200 ? md : null;
  } catch (e) {
    console.log(`firecrawl 抓取失败(${url}): ${e.message}`);
    return null;
  }
}

// 全文再长也只取前 12000 字,足够写 3-6 段听稿
const FULLTEXT_LIMIT = 12000;

// 第二步:逐篇改写为听稿。
const pieces = [];

for (const pick of picks.slice(0, PICKS_PER_DAY)) {
  const c = CANDIDATES[pick.index];
  try {
  const fullText = await fetchFullText(c.link);
  const material = fullText
    ? `原文全文(Markdown,可能截断):\n${fullText.slice(0, FULLTEXT_LIMIT)}\n\n注意:严格基于原文转述,不得添加原文没有的事实。`
    : `摘要:${c.summary}\n\n注意:你只有摘要。只转述摘要中明确的信息,可以补充公认的背景知识,但不得虚构原文细节。`;
  console.log(`素材: ${c.title} → ${fullText ? `全文 ${fullText.length} 字` : "仅摘要"}`);
  const script = await chatJson(
    `你是"轻听"的撰稿人。按评分标准里的"听稿改写要求"工作。\n\n${RUBRIC}`,
    `把下面这篇内容改写成中文听稿。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n${material}

以 JSON 返回,格式为 {"title": "中文标题,凝练有余味,不用冒号堆砌", "intro": "一句话导语", "paragraphs": ["3-6 段听稿正文,每段一个字符串"]}。`,
    `听稿(${c.title})`,
  );
  const validScript =
    typeof script.title === "string" &&
    script.title.trim() &&
    typeof script.intro === "string" &&
    script.intro.trim() &&
    Array.isArray(script.paragraphs) &&
    script.paragraphs.length >= 3 &&
    script.paragraphs.every((p) => typeof p === "string" && p.trim());
  if (!validScript) {
    console.log(`跳过(听稿格式不合格): ${c.title}`);
    continue;
  }

  pieces.push({
    slug: `${today}-${slugify(c.title)}`,
    title: script.title,
    category: pick.category,
    author: "轻听编辑部",
    publishedAt: today,
    intro: script.intro,
    paragraphs: script.paragraphs,
    topics: pick.topics,
    form: "pick",
    source: { name: c.sourceName, url: c.link, originalTitle: c.title },
  });
  console.log(`wrote 听稿: ${script.title}`);
  } catch (e) {
    console.log(`跳过(改写失败): ${c.title} — ${e.message}`);
  }
}

function slugify(s) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return ascii || Math.random().toString(36).slice(2, 8);
}

// 最新的排前面;保留最近 60 篇
const merged = [...pieces, ...existing].slice(0, 60);
writeFileSync(DAILY, JSON.stringify(merged, null, 2));
console.log(`daily.json now has ${merged.length} pieces`);
