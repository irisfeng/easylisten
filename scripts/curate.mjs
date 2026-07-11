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

// 第一步:全量评分,选出今日入选名单(结构化输出保证可解析)。
const menu = CANDIDATES.map(
  (c, i) =>
    `[${i}] (${c.category}/${c.sourceName}${c.resonance > 1 ? `/共振x${c.resonance}` : ""}) ${c.title}\n${c.summary.slice(0, 400)}`,
).join("\n\n");

const scoring = await client.messages.create({
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  system: `你是"轻听"的主编。严格按下面的评分标准挑选内容,宁缺毋滥。\n\n${RUBRIC}`,
  messages: [
    {
      role: "user",
      content: `以下是今天的候选池。为每篇打分,并选出最值得听的 ${PICKS_PER_DAY} 篇(四个频道尽量各有覆盖,但质量优先)。\n\n${menu}`,
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
                category: { type: "string", enum: ["science", "news", "essay", "culture"] },
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

const { picks } = JSON.parse(scoring.content.find((b) => b.type === "text").text);
console.log(`selected ${picks.length}:`, picks.map((p) => `[${p.index}] ${p.score}`).join(", "));

// 第二步:逐篇改写为听稿。
const today = new Date().toISOString().slice(0, 10);
const pieces = [];

for (const pick of picks.slice(0, PICKS_PER_DAY)) {
  const c = CANDIDATES[pick.index];
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: `你是"轻听"的撰稿人。按评分标准里的"听稿改写要求"工作。\n\n${RUBRIC}`,
    messages: [
      {
        role: "user",
        content: `把下面这篇内容改写成中文听稿。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n摘要:${c.summary}\n\n注意:你只有摘要。只转述摘要中明确的信息,可以补充公认的背景知识,但不得虚构原文细节。`,
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
  const script = JSON.parse(msg.content.find((b) => b.type === "text").text);

  pieces.push({
    slug: `${today}-${slugify(c.title)}`,
    title: script.title,
    category: pick.category,
    author: "轻听编辑部",
    publishedAt: today,
    intro: script.intro,
    paragraphs: script.paragraphs,
    topics: pick.topics,
    source: { name: c.sourceName, url: c.link, originalTitle: c.title },
  });
  console.log(`wrote 听稿: ${script.title}`);
}

function slugify(s) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return ascii || Math.random().toString(36).slice(2, 8);
}

const existing = existsSync(DAILY) ? JSON.parse(readFileSync(DAILY, "utf8")) : [];
// 最新的排前面;保留最近 60 篇
const merged = [...pieces, ...existing].slice(0, 60);
writeFileSync(DAILY, JSON.stringify(merged, null, 2));
console.log(`daily.json now has ${merged.length} pieces`);
