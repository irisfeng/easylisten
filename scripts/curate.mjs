/**
 * 精选:读取 content/candidates.json,按 content/rubric.md 评分,
 * 把入选文章改写成中文听稿,追加进 content/daily.json。
 *
 * 需要 ANTHROPIC_API_KEY(GitHub Actions 中配置为 secret):
 *   node scripts/ingest.mjs && node scripts/curate.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = resolve(import.meta.dirname, "..");
const RUBRIC = readFileSync(resolve(ROOT, "content/rubric.md"), "utf8");
const CANDIDATES = JSON.parse(readFileSync(resolve(ROOT, "content/candidates.json"), "utf8"));
const DAILY = resolve(ROOT, "content/daily.json");

const PICKS_PER_DAY = 4;
const MODEL = "claude-opus-4-8";

const client = new Anthropic();

// 日刊按北京日历日期落款(定时任务在 UTC 22:00 = 北京次日早 6 点运行)
const today =
  process.env.ISSUE_DATE ||
  new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" });

// 结构化输出也可能因 refusal / max_tokens 终止,解析前先核验
function extractJson(msg, label) {
  if (msg.stop_reason !== "end_turn") {
    throw new Error(`${label}: 非正常结束 stop_reason=${msg.stop_reason},本次不出刊`);
  }
  const text = msg.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`${label}: 响应中没有文本块`);
  return JSON.parse(text);
}

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

const scoring = await client.messages.create({
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  system: `你是"轻听"的主编。严格按下面的评分标准与编排规则挑选内容,宁缺毋滥。\n\n${RUBRIC}`,
  messages: [
    {
      role: "user",
      content: `以下是今天的候选池。为每篇打分,并按编排规则选出今天的 ${PICKS_PER_DAY} 篇节目单(同一领域最多 2 篇,质量优先)。${starved.length ? `近三天未覆盖的领域(同分时优先):${starved.join("、")}。` : ""}topics 从这个列表里选:航天与宇宙、生命与演化、物质与数学、脑与认知、AI 与计算、工程与制造、互联网产品、数字生活、全球时事、经济与商业、城市与公共、气候与能源、历史、哲学与思想、艺术与设计、阅读与写作、健康与医学、心理与情绪、食物与日常、出行与旅行、音乐、影视与游戏、流行与网络文化、体育。\n\n${menu}`,
    },
  ],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          picks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                score: { type: "integer" },
                category: {
                  type: "string",
                  enum: ["science", "tech", "society", "humanities", "living", "culture"],
                },
                topics: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
              },
              required: ["index", "score", "category", "topics", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["picks"],
        additionalProperties: false,
      },
    },
  },
});

const { picks } = extractJson(scoring, "评分");
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
  const fullText = await fetchFullText(c.link);
  const material = fullText
    ? `原文全文(Markdown,可能截断):\n${fullText.slice(0, FULLTEXT_LIMIT)}\n\n注意:严格基于原文转述,不得添加原文没有的事实。`
    : `摘要:${c.summary}\n\n注意:你只有摘要。只转述摘要中明确的信息,可以补充公认的背景知识,但不得虚构原文细节。`;
  console.log(`素材: ${c.title} → ${fullText ? `全文 ${fullText.length} 字` : "仅摘要"}`);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: `你是"轻听"的撰稿人。按评分标准里的"听稿改写要求"工作。\n\n${RUBRIC}`,
    messages: [
      {
        role: "user",
        content: `把下面这篇内容改写成中文听稿。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n${material}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "中文标题,凝练有余味,不用冒号堆砌" },
            intro: { type: "string", description: "一句话导语" },
            paragraphs: { type: "array", items: { type: "string" }, description: "3-6 段听稿正文" },
          },
          required: ["title", "intro", "paragraphs"],
          additionalProperties: false,
        },
      },
    },
  });
  const msg = await stream.finalMessage();
  const script = extractJson(msg, `听稿(${c.title})`);

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
}

function slugify(s) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return ascii || Math.random().toString(36).slice(2, 8);
}

// 最新的排前面;保留最近 60 篇
const merged = [...pieces, ...existing].slice(0, 60);
writeFileSync(DAILY, JSON.stringify(merged, null, 2));
console.log(`daily.json now has ${merged.length} pieces`);
