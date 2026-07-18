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

// 编排:每期 2–5 篇浮动,只收达到质量门槛的;宁缺毋滥
const MIN_PICKS = 2;
// 6 是天花板不是指标:候选池肥的日子自然多出,瘦的日子照样 2-3 篇
const MAX_PICKS = 6;
const QUALITY_BAR = 80;

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

// 跨天去重:近七天已出刊的选题,提示模型避开同一事件与同质题材
const recentTitles = existing
  .filter((p) => Date.now() - Date.parse(p.publishedAt) < 7 * 24 * 3600 * 1000)
  .map((p) => p.source?.originalTitle || p.title);

// 周六(以北京日期计)额外出一篇"周末深读"
const isSaturday = new Date(`${today}T00:00:00Z`).getUTCDay() === 6;

// 第一步:全量评分,选出今日入选名单(结构化输出保证可解析)。
const menu = CANDIDATES.map(
  (c, i) =>
    `[${i}] (${c.category}/${c.sourceName}${c.resonance > 1 ? `/共振x${c.resonance}` : ""}) ${c.title}\n${c.summary.slice(0, 400)}`,
).join("\n\n");

const scoreResult = await chatJson(
  `你是"轻听"的主编。严格按下面的评分标准与编排规则挑选内容,宁缺毋滥。\n\n${RUBRIC}`,
  `以下是今天的候选池。为每篇打分,并按编排规则选出今天的节目单:${MIN_PICKS}–${MAX_PICKS} 篇,只选 ${QUALITY_BAR} 分及以上的;达标的少就少选,宁缺毋滥(同一领域最多 2 篇)。${starved.length ? `近三天未覆盖的领域(同分时优先):${starved.join("、")}。` : ""}${recentTitles.length ? `
近七天已讲过这些内容,除非有重大新进展,不要再选同一事件或高度同质的选题:${recentTitles.slice(0, 40).join(" / ")}。` : ""}
category 从这六个里选:science、tech、society、humanities、living、culture。
topics 从这个列表里选:航天与宇宙、生命与演化、物质与数学、脑与认知、AI 与计算、工程与制造、互联网产品、数字生活、全球时事、经济与商业、城市与公共、气候与能源、历史、哲学与思想、艺术与设计、阅读与写作、健康与医学、心理与情绪、食物与日常、出行与旅行、音乐、影视与游戏、流行与网络文化、体育。${isSaturday ? `
今天是周六,请额外挑一篇最适合"周末深读"的候选填进 deep 字段:优先叙事有纵深、论证完整的非热点长文(essays、深度报道),它不占节目单名额,且不得与 picks 重复。` : ""}

以 JSON 返回,格式为 {"picks": [{"index": 候选序号(整数), "score": 分数(整数), "category": 领域, "topics": [话题], "reason": "一句话理由"}]${isSaturday ? `, "deep": {"index": 候选序号(整数), "category": 领域, "topics": [话题]}` : ""}}。

${menu}`,
  "评分",
);
const rawPicks = Array.isArray(scoreResult.picks) ? scoreResult.picks : [];
const indexes = rawPicks.map((p) => p.index);
const structValid =
  indexes.length >= 1 &&
  indexes.length <= MAX_PICKS &&
  indexes.every((i) => Number.isInteger(i) && i >= 0 && i < CANDIDATES.length) &&
  new Set(indexes).size === indexes.length;
if (!structValid) throw new Error("评分:未返回有效且唯一的 picks");
// 质量门槛在代码里再执行一次,不全信模型的自觉
const picks = rawPicks.filter((p) => Number.isInteger(p.score) && p.score >= QUALITY_BAR);
if (picks.length === 0) {
  console.log(`今日候选均未达 ${QUALITY_BAR} 分,宁缺毋滥,本期不出刊`);
  process.exit(0);
}
if (picks.length < MIN_PICKS) {
  console.log(`达标仅 ${picks.length} 篇,少而精照常出刊`);
}
console.log(`selected ${picks.length}:`, picks.map((p) => `[${p.index}] ${p.score}`).join(", "));

// 周末深读候选:结构合法即有效;若与常规名单重复,让常规名单让位——
// 被双重提名的恰恰是最好的深读素材,降级成短稿才是浪费(07-18 首个周六
// 就因旧的"重复即弃深读"逻辑静默丢了深读)
const deep = isSaturday ? scoreResult.deep : null;
const deepValid =
  deep &&
  Number.isInteger(deep.index) &&
  deep.index >= 0 &&
  deep.index < CANDIDATES.length;
if (isSaturday && !deepValid) {
  console.log("深读:模型未提名有效候选,本周跳过");
}
const regularPicks = deepValid
  ? picks.filter((p) => p.index !== deep.index)
  : picks;
if (regularPicks.length !== picks.length) {
  console.log(`深读与常规入选重复,让位给深读: [${deep.index}]`);
}

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

// 全文再长也只取前 12000 字,足够写 3-6 段听稿;深读需要更足的素材
const FULLTEXT_LIMIT = 12000;
const DEEP_FULLTEXT_LIMIT = 24000;

// 第二步:逐篇改写为听稿。
const pieces = [];

// 双语实验:记住得分最高且改写成功的那篇及其素材,稍后追加英文转述稿
let bestEn = null;

for (const pick of regularPicks) {
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
  if (!bestEn || pick.score > bestEn.score) {
    bestEn = { piece: pieces[pieces.length - 1], material, c, score: pick.score };
  }
  } catch (e) {
    console.log(`跳过(改写失败): ${c.title} — ${e.message}`);
  }
}

// 周末深读:基于足量原文精写十分钟长稿;素材不足或改写失败则放弃,不硬写
if (deepValid) {
  const c = CANDIDATES[deep.index];
  try {
    const fullText = await fetchFullText(c.link);
    if (!fullText || fullText.length < 3000) {
      console.log(`深读放弃(原文不足以支撑长稿): ${c.title}`);
    } else {
      console.log(`深读素材: ${c.title} → 全文 ${fullText.length} 字`);
      const script = await chatJson(
        `你是"轻听"的撰稿人。按评分标准里的"周末深读改写要求"工作。\n\n${RUBRIC}`,
        `把下面这篇长文改写成"周末深读"中文听稿:2200–3500 字、7–12 段。不是把短稿拉长,而是保留原文的论证层次、关键细节与转折;开头一段交代为什么值得花十分钟听它。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n原文全文(Markdown,可能截断):\n${fullText.slice(0, DEEP_FULLTEXT_LIMIT)}\n\n注意:严格基于原文转述,不得添加原文没有的事实。\n\n以 JSON 返回,格式为 {"title": "中文标题,凝练有余味", "intro": "一句话导语", "paragraphs": ["每段一个字符串"]}。`,
        `深读(${c.title})`,
      );
      const validDeep =
        typeof script.title === "string" &&
        script.title.trim() &&
        typeof script.intro === "string" &&
        script.intro.trim() &&
        Array.isArray(script.paragraphs) &&
        script.paragraphs.length >= 6 &&
        script.paragraphs.every((p) => typeof p === "string" && p.trim()) &&
        script.paragraphs.join("").length >= 1600;
      if (!validDeep) {
        console.log(`深读放弃(听稿不合格): ${c.title}`);
      } else {
        pieces.push({
          slug: `${today}-${slugify(c.title)}`,
          title: script.title,
          category: ALL_CATS.includes(deep.category) ? deep.category : "humanities",
          author: "轻听编辑部",
          publishedAt: today,
          intro: script.intro,
          paragraphs: script.paragraphs,
          topics: Array.isArray(deep.topics) ? deep.topics : [],
          form: "long",
          shelf: "evergreen",
          source: { name: c.sourceName, url: c.link, originalTitle: c.title },
        });
        console.log(`wrote 深读: ${script.title}`);
      }
    }
  } catch (e) {
    console.log(`深读放弃(失败): ${c.title} — ${e.message}`);
  }
}

function slugify(s) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return ascii || Math.random().toString(36).slice(2, 8);
}

// 双语实验:给当日最高分的一篇追加英文转述稿(不是照读原文——那是版权红线;
// 是我们自己的英文改写)。失败只跳过,不影响出刊。
if (bestEn) {
  try {
    const en = await chatJson(
      `You are a writer for "EasyListen", a daily listening digest. You rewrite articles as scripts meant to be heard, not read: conversational, linear reasoning, a hook at the start, an afterthought at the end. Never copy the original text verbatim; retell it in your own words with attribution-safe paraphrase.`,
      `Rewrite the following article as an English listening script (3-6 paragraphs, plain spoken English).\n\nTitle: ${bestEn.c.title}\nSource: ${bestEn.c.sourceName}\n${bestEn.material}\n\nReturn JSON: {"title": "concise English title", "intro": "one-sentence lead", "paragraphs": ["each paragraph as a string"]}`,
      `英文稿(${bestEn.c.title})`,
    );
    const validEn =
      typeof en.title === "string" &&
      en.title.trim() &&
      typeof en.intro === "string" &&
      en.intro.trim() &&
      Array.isArray(en.paragraphs) &&
      en.paragraphs.length >= 3 &&
      en.paragraphs.every((p) => typeof p === "string" && p.trim());
    if (validEn) {
      bestEn.piece.en = { title: en.title, intro: en.intro, paragraphs: en.paragraphs };
      console.log(`wrote 英文稿: ${en.title}`);
    } else {
      console.log(`英文稿格式不合格,跳过: ${bestEn.c.title}`);
    }
  } catch (e) {
    console.log(`英文稿生成失败(跳过): ${e.message}`);
  }
}

// 最新的排前面;保留最近 60 篇
const merged = [...pieces, ...existing].slice(0, 60);
writeFileSync(DAILY, JSON.stringify(merged, null, 2));
console.log(`daily.json now has ${merged.length} pieces`);

// 主编的话:点出今天几篇之间的隐线。生成失败只跳过,不影响出刊。
if (pieces.length > 0) {
  const EDITORIAL = resolve(ROOT, "content/editorial.json");
  try {
    const r = await chatJson(
      `你是"轻听"的主编。按评分标准里的"主编的话"要求工作:语气克制、有判断,不逐篇罗列,不喊口号,不用感叹号。\n\n${RUBRIC}`,
      `今天的节目单如下,请写一段 60–100 字的"主编的话"。\n\n${pieces.map((p) => `《${p.title}》——${p.intro}`).join("\n")}\n\n以 JSON 返回:{"note": "主编的话"}。`,
      "主编导语",
    );
    if (typeof r.note === "string" && r.note.trim()) {
      const prev = existsSync(EDITORIAL) ? JSON.parse(readFileSync(EDITORIAL, "utf8")) : [];
      const next = [
        { date: today, note: r.note.trim() },
        ...prev.filter((e) => e.date !== today),
      ].slice(0, 60);
      writeFileSync(EDITORIAL, JSON.stringify(next, null, 2));
      console.log(`wrote 主编导语: ${r.note.trim().slice(0, 24)}…`);
    }
  } catch (e) {
    console.log(`主编导语生成失败(跳过): ${e.message}`);
  }
}
