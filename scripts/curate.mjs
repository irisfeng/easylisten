/**
 * 精选:读取 content/candidates.json,按 content/rubric.md 评分,
 * 把入选文章改写成中文听稿；同日重跑时替换当天旧刊。
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
import {
  buildCurationAttemptQueue,
  hasVerifiableSource,
  mergeDailyPieces,
  normalizeAgeBands,
  rankBilingualCandidates,
  selectCandidatePool,
  selectPublishableEntries,
} from "./lib/curation-policy.mjs";
import { fetchFullText } from "./lib/full-text.mjs";
import {
  buildEvidenceBlocks,
  materializeEvidenceQuotes,
  validateFactReview,
} from "./lib/fact-review.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const RUBRIC = readFileSync(resolve(ROOT, "content/rubric.md"), "utf8");
// 源库扩容后候选可达 200+,评分前预筛保留中文、六领域与实时内容的可见性,
// 再用多源共振、源权重和时效排序。扩大到 160 条用于候补梯队，但仍由
// 单次结构化评分统一筛选，避免为了“广撒网”并发重复调用模型。
const RAW_CANDIDATES = JSON.parse(
  readFileSync(resolve(ROOT, "content/candidates.json"), "utf8"),
);
const CANDIDATES = selectCandidatePool(RAW_CANDIDATES, 160);
const DAILY = resolve(ROOT, "content/daily.json");

// 编排:每期 2–6 篇浮动,只收达到质量门槛的;宁缺毋滥
const MIN_PICKS = 2;
// 6 是天花板不是指标:候选池肥的日子自然多出,瘦的日子照样 2-3 篇
const MAX_PICKS = 6;
// 主名单改写或事实二审失败后，最多继续尝试 10 篇同门槛候补。
const MAX_CURATION_ATTEMPTS = 10;
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
const factReviewProvider =
  PROVIDERS.find((candidate) => candidate.env !== provider.env && process.env[candidate.env]) ??
  provider;
console.log(
  `事实二审: ${factReviewProvider.env} → ${factReviewProvider === provider ? MODEL : factReviewProvider.model}`,
);

/**
 * 调用 OpenAI 兼容的 /chat/completions,强制 JSON 输出并解析。
 * DeepSeek 与百炼均支持 response_format:{type:"json_object"}(提示里需含 "json")。
 */
async function chatJsonWith(service, model, system, user, label, temperature = 0.7) {
  const res = await fetch(`${service.base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env[service.env]}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature,
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

async function chatJson(system, user, label, temperature = 0.7) {
  return chatJsonWith(provider, MODEL, system, user, label, temperature);
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
function freshnessLabel(publishedAt) {
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return "时间未知";
  const hours = Math.max(0, Math.round((Date.now() - timestamp) / 3600000));
  return hours < 48 ? `${hours}小时前` : `${Math.round(hours / 24)}天前`;
}

const menu = CANDIDATES.map(
  (c, i) =>
    `[${i}] (${c.category}/${c.lang}/${c.region === "mainland" ? "中国大陆" : "国际"}/${c.sourceName}/发布者${c.publisher ?? c.sourceName}/权重${c.weight}/${c.profile ?? "general"}/最低适龄${c.minAgeBand ?? "逐篇判断"}/${freshnessLabel(c.publishedAt)}${c.resonance > 1 ? `/共振x${c.resonance}` : ""}) ${c.title}\n${c.summary.slice(0, 240)}`,
).join("\n\n");

const scoreResult = await chatJson(
  `你是"轻听"的主编。严格按下面的评分标准与编排规则挑选内容,宁缺毋滥。\n\n${RUBRIC}`,
  `今天是北京时间 ${today}。以下是候选池。为每篇打分,并按编排规则选出今天的节目单:${MIN_PICKS}–${MAX_PICKS} 篇,只选 ${QUALITY_BAR} 分及以上的;达标的少就少选,宁缺毋滥(同一领域最多 2 篇)。
来源原则:权重 1.1–1.2 是权威/深度核心源,1.0 是可信常规源,0.8–0.9 是发现源;来源声誉不能替代文章质量,发现源的爆炸性主张必须有可靠来源支撑。
少年适配:听众固定分为 6-9、10-12、13-16 三个年龄段,选择者是家长。每期至少 2 篇应让 6-9 或 10-12 岁孩子无需额外背景也能听懂;候选标注的“最低适龄”是代码硬下限,不得向下误标。战争、灾难、犯罪和死亡等沉重议题最多 1 篇且避免细节渲染。纯游戏/影视/新品官宣、销量战报和阵容清单不入选,除非文章提供创作、技术、产业或文化层面的解释。单一小样本健康研究不得被包装成普遍结论或行动建议。
中文覆盖:若中文原始来源中有达标内容,节目单目标包含 2 篇左右,但绝不能为凑比例降低 ${QUALITY_BAR} 分门槛或牺牲领域多样性。
国内主场:若中国大陆发布者中有达标内容,节目单至少一半来自国内源；仍须逐篇超过 ${QUALITY_BAR} 分，不得用低质量内容凑比例。国内内容不能只来自科技数码，要兼顾科学、教育、社会、人文、健康和体育。
重大事件:未来 24 小时内或刚发生的全球性事件值得关注,但只选提供背景、机制、历史、战术、文化或社会影响的解释性内容;比分搬运、胜负预测、阵容清单和情绪化热评不入选。同一重大事件最多 1 篇,除非两篇视角显著不同且都超过 90 分。同一发布来源每天最多 1 篇。
实时与长青必须并存:至少保留 1 篇与热点无关、以后仍值得听的内容。${starved.length ? `近三天未覆盖的领域(同分时优先):${starved.join("、")}。` : ""}${recentTitles.length ? `
近七天已讲过这些内容,除非有重大新进展,不要再选同一事件或高度同质的选题:${recentTitles.slice(0, 40).join(" / ")}。` : ""}
category 从这六个里选:science、tech、society、humanities、living、culture。
topics 从这个列表里选:航天与宇宙、生命与演化、物质与数学、脑与认知、AI 与计算、工程与制造、互联网产品、数字生活、全球时事、经济与商业、城市与公共、气候与能源、历史、哲学与思想、艺术与设计、阅读与写作、健康与医学、心理与情绪、食物与日常、出行与旅行、音乐、影视与游戏、流行与网络文化、体育。${isSaturday ? `
今天是周六,请额外挑一篇最适合"周末深读"的候选填进 deep 字段:优先叙事有纵深、论证完整的非热点长文(essays、深度报道),它不占节目单名额,且不得与 picks 重复。` : ""}

除最终节目单 picks 外，再给出 4–6 篇 reserves 候补。候补必须同样达到 ${QUALITY_BAR} 分，且尽量来自不同发布者和领域；它们只在主名单全文取得、改写或事实二审失败时接替，不是降低门槛凑数。picks 与 reserves 的 index 不得重复。

以 JSON 返回,格式为 {"picks": [{"index": 候选序号(整数), "score": 分数(整数), "category": 领域, "topics": [话题], "reason": "一句话理由"}], "reserves": [{"index": 候选序号(整数), "score": 分数(整数), "category": 领域, "topics": [话题], "reason": "候补理由"}]${isSaturday ? `, "deep": {"index": 候选序号(整数), "category": 领域, "topics": [话题]}` : ""}}。

${menu}`,
  "评分",
);
const rawPicks = Array.isArray(scoreResult.picks) ? scoreResult.picks : [];
const rawReserves = Array.isArray(scoreResult.reserves) ? scoreResult.reserves : [];
const shortlist = [...rawPicks, ...rawReserves];
const indexes = shortlist.map((p) => p.index);
const structValid =
  rawPicks.length >= 1 &&
  rawPicks.length <= MAX_PICKS &&
  rawReserves.length <= 6 &&
  indexes.length <= MAX_PICKS + 6 &&
  indexes.every((i) => Number.isInteger(i) && i >= 0 && i < CANDIDATES.length) &&
  new Set(indexes).size === indexes.length;
if (!structValid) throw new Error("评分:未返回有效且唯一的 picks/reserves");
// 主名单与候补都必须达到同一质量线；候补只在前序失败时继续尝试。
const picks = buildCurationAttemptQueue(rawPicks, rawReserves, CANDIDATES, {
  qualityBar: QUALITY_BAR,
  maxAttempts: MAX_CURATION_ATTEMPTS,
});
if (picks.length !== shortlist.length) {
  console.log(`候补硬约束: 模型提名 ${shortlist.length} 篇 → 可尝试 ${picks.length} 篇`);
}
if (picks.length === 0) {
  console.log(`今日候选均未达 ${QUALITY_BAR} 分,宁缺毋滥,本期不出刊`);
  process.exit(0);
}
if (picks.length < MIN_PICKS) {
  throw new Error(`候选梯队仅 ${picks.length} 篇达到硬门槛，少于出刊最低 ${MIN_PICKS} 篇`);
}
console.log(
  `候选梯队 ${picks.length}（主名单 ${rawPicks.length} / 候补 ${rawReserves.length}）:`,
  picks.map((p) => `[${p.index}] ${p.score}`).join(", "),
);
const chinesePicks = picks.filter((pick) => CANDIDATES[pick.index]?.lang === "zh");
console.log(
  `中文原始来源 ${chinesePicks.length}/${picks.length}: ${chinesePicks.map((pick) => CANDIDATES[pick.index].sourceName).join(" / ") || "无"}`,
);

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
 * 标题二审与基础闸门。听稿模型容易把两条事实硬压成一个“有余味”的短语，
 * 例如“每天一次 + 降低一半”被压成“一次半”。二审只在标题不清楚、歧义、
 * 数字关系缺主语或有事实过度承诺时改写；清楚的标题必须原样保留。
 */
function titleQualityIssues(title) {
  const t = typeof title === "string" ? title.trim() : "";
  const issues = [];
  if (t.length < 8 || t.length > 38) issues.push("长度不合适");
  if (!/[\u3400-\u9fff]/.test(t)) issues.push("不是中文标题");
  if ((t.match(/[：:]/g) ?? []).length > 1) issues.push("冒号堆砌");
  if (/一次半|一半次|半次|[一二三四五六七八九十\d]+[次倍]半/.test(t)) {
    issues.push("数字或量词关系含混");
  }
  if (/^[，。！？、：；,.!?:;]|[，、：；,:;]$/.test(t)) {
    issues.push("标题像残句");
  }
  return issues;
}

async function reviewTitle(script, candidate) {
  const current = script.title.trim();
  const review = await chatJson(
    `你是中文新闻标题编辑。标题首先要让普通读者一眼看懂，其次才是文采。
规则：标题必须脱离导语也能独立理解；不得把两条数字事实压成新造短语；数字要说清谁、做什么、多少；不得使用没有解释的双关、悬空量词、病句或标题党；不得超出原题和导语的事实。清楚准确的标题必须原样保留。`,
    `请复核下面的中文标题。
原文标题：${candidate.title}
候选中文标题：${current}
导语：${script.intro}

以 JSON 返回：{"ok": true或false, "title": "最终中文标题", "reason": "一句话理由"}。ok=true 时 title 必须与候选中文标题完全一致；只有存在歧义、病句、数字关系不清或事实过度承诺时才改。`,
    `标题二审(${candidate.title})`,
    0.2,
  );
  const finalTitle = typeof review.title === "string" ? review.title.trim() : "";
  const issues = titleQualityIssues(finalTitle);
  if (!finalTitle || issues.length) {
    throw new Error(`标题二审不合格: ${issues.join("、") || "没有有效标题"}`);
  }
  if (review.ok !== true || finalTitle !== current) {
    console.log(`标题二审: ${current} → ${finalTitle} (${review.reason ?? "需澄清"})`);
  }
  return finalTitle;
}

async function reviewScriptFacts(script, candidate, fullText) {
  let currentScript = script;
  let retryReason = "";
  const reviewSource = fullText.slice(
    0,
    currentScript.paragraphs.length > 6 ? DEEP_FULLTEXT_LIMIT : FULLTEXT_LIMIT,
  );
  const evidenceBlocks = buildEvidenceBlocks(reviewSource);
  const numberedSource = evidenceBlocks
    .map((block) => `[${block.id}] ${block.quote.replace(/\s+/g, " ")}`)
    .join("\n");
  for (let attempt = 1; attempt <= 2; attempt++) {
    const review = await chatJsonWith(
      factReviewProvider,
      factReviewProvider === provider ? MODEL : factReviewProvider.model,
      `你是独立事实审稿人，不参与选题，也不替撰稿人圆场。你的唯一任务是让听稿中的每个可核查陈述都忠于给定原文。
逐项核对：比分、数字、日期、分钟、比赛阶段、人物身份、地点、奖项、引语、因果、比较级和“首次/唯一/刷新纪录”等断言。
原文没有明确写出的内容必须删除，不得用常识、记忆或搜索结果补充。直接引语必须在原文逐字存在；“赛后表示”“获评最佳”等归因也必须有原文证据。
即使只发现一处错误，也要修正整篇后再返回。每段至少给一条能够支撑该段最重要事实的原文连续摘录。`,
      `原文标题：${candidate.title}
来源：${candidate.sourceName}
原文证据块（编号和内容均由程序从原文生成）：
${numberedSource}

待审听稿：
${JSON.stringify({ title: currentScript.title, intro: currentScript.intro, paragraphs: currentScript.paragraphs })}

${retryReason ? `上一轮代码校验失败：${retryReason}
这是最后一次证据修复。不要为保留原句而编造证据：无法由原文支持的句子必须删除或改成原文明确支持的表述。每段只能选择真正支持其关键事实的 sourceId，不得猜测或编造编号。` : ""}

以 JSON 返回：
{"ok": true或false, "issues": ["发现的问题"], "final": {"title": "核验后的标题", "intro": "核验后的导语", "paragraphs": ["保持待审听稿段数的核验后正文"]}, "evidence": [{"paragraphIndex": 0, "sourceId": "E001"}]}。
paragraphIndex 从 0 开始，每一段都必须覆盖；sourceId 必须选自上方证据块。不要复制 sourceQuote，程序会按编号从原文精确回填。`,
      `${retryReason ? "事实证据修复" : "事实二审"}(${candidate.title})`,
      0.1,
    );
    try {
      const reviewWithExactQuotes = materializeEvidenceQuotes(review, evidenceBlocks);
      const finalScript = validateFactReview(reviewWithExactQuotes, fullText);
      if (review.ok !== true || (Array.isArray(review.issues) && review.issues.length)) {
        console.log(
          `事实二审修正: ${candidate.title} — ${
            Array.isArray(review.issues) ? review.issues.join("；") : "存在未说明的问题"
          }`,
        );
      }
      return {
        script: finalScript,
        audit: {
          status: "verified",
          reviewedAt: new Date().toISOString(),
          reviewer: factReviewProvider === provider ? MODEL : factReviewProvider.model,
          evidenceCount: reviewWithExactQuotes.evidence.length,
          correctionCount: Array.isArray(review.issues) ? review.issues.length : 0,
          attempts: attempt,
        },
      };
    } catch (error) {
      if (attempt >= 2) throw error;
      retryReason = error.message;
      if (
        review?.final &&
        typeof review.final.title === "string" &&
        typeof review.final.intro === "string" &&
        Array.isArray(review.final.paragraphs)
      ) {
        currentScript = review.final;
      }
      console.log(`事实证据修复重试: ${candidate.title} — ${retryReason}`);
    }
  }
  throw new Error(`事实二审失败：${candidate.title}`);
}

// 全文再长也只取前 12000 字,足够写 3-6 段听稿;深读需要更足的素材
const FULLTEXT_LIMIT = 12000;
const DEEP_FULLTEXT_LIMIT = 24000;

// 第二步:按主名单 → 候补顺序逐篇改写。先保留通过中文事实二审的草稿，
// 再按节目单硬约束收紧；失败候选不会占用最终 2–6 篇的席位。
const regularDrafts = [];

for (const pick of regularPicks) {
  const c = CANDIDATES[pick.index];
  try {
    const fullText = await fetchFullText(c.link);
    if (!hasVerifiableSource(c, fullText)) {
      console.log(`跳过(来源或完整原文不可核验): ${c.title}`);
      continue;
    }
    const material = `原文全文(Markdown,可能截断):\n${fullText.slice(0, FULLTEXT_LIMIT)}\n\n注意:严格基于原文转述,不得添加原文没有的事实。`;
    console.log(`素材: ${c.title} → 全文 ${fullText.length} 字`);
    const script = await chatJson(
      `你是"轻听"的撰稿人。按评分标准里的"听稿改写要求"工作。\n\n${RUBRIC}`,
      `把下面这篇内容改写成中文听稿。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n${material}\n\n同时判断适龄段：6-9 为小学低年级，10-12 为小学高年级，13-16 为初中。按概念难度、情绪安全和孩子能否独立听懂选择一个或多个，不因题材“高级”就机械排除低龄。${c.minAgeBand ? `该来源的保守最低适龄段是 ${c.minAgeBand}，不得返回更低年龄段；这只是下限，具体文章仍可只标更高年龄段。` : ""}\n\n以 JSON 返回,格式为 {"title": "中文标题,首先清楚准确,再求凝练有余味;不用冒号堆砌,不造含混短语,数字必须说清对象与关系", "intro": "一句话导语", "paragraphs": ["3-6 段听稿正文,每段一个字符串"], "ageBands": ["6-9", "10-12", "13-16"]}。`,
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
    const factChecked = await reviewScriptFacts(script, c, fullText);
    script.title = factChecked.script.title;
    script.intro = factChecked.script.intro;
    script.paragraphs = factChecked.script.paragraphs;
    script.title = await reviewTitle(script, c);

    const piece = {
      slug: `${today}-${slugify(c.title)}`,
      title: script.title,
      category: pick.category,
      author: "轻听编辑部",
      publishedAt: today,
      intro: script.intro,
      paragraphs: script.paragraphs,
      topics: pick.topics,
      ageBands: normalizeAgeBands(script.ageBands, { minAgeBand: c.minAgeBand }),
      form: "pick",
      source: {
        name: c.sourceName,
        url: c.link,
        originalTitle: c.title,
        publishedAt: c.publishedAt || undefined,
        retrievedAt: new Date().toISOString(),
        basis: "full-text",
        lang: c.lang,
        profile: c.profile ?? "general",
        factReview: factChecked.audit,
      },
    };
    regularDrafts.push({
      piece,
      material,
      c,
      pick,
      score: pick.score,
      hasFullText: Boolean(fullText),
      fullText,
    });
    console.log(`wrote 听稿: ${script.title}`);
    const bilingualReady = regularDrafts.filter(
      (draft) => draft.hasFullText && draft.score >= 85,
    ).length;
    if (regularDrafts.length >= MAX_PICKS && bilingualReady >= 3) {
      console.log("候选备份已充足：6 篇中文草稿、至少 3 篇双语候选，停止额外模型调用");
      break;
    }
  } catch (e) {
    console.log(`跳过(改写失败): ${c.title} — ${e.message}`);
  }
}

const finalRegular = selectPublishableEntries(regularDrafts, CANDIDATES, {
  qualityBar: QUALITY_BAR,
  minPicks: MIN_PICKS,
  maxPicks: MAX_PICKS,
});
if (finalRegular.length < MIN_PICKS) {
  throw new Error(
    `每日发布契约未满足：${regularDrafts.length} 篇草稿中仅 ${finalRegular.length} 篇满足最终编排，至少需要 ${MIN_PICKS} 篇`,
  );
}
const pieces = finalRegular.map((entry) => entry.piece);
const bilingualCandidates = finalRegular;
console.log(
  `中文草稿 ${regularDrafts.length} → 最终节目单 ${finalRegular.length}: ` +
    finalRegular.map((entry) => entry.piece.title).join(" / "),
);

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
        `把下面这篇长文改写成"周末深读"中文听稿:2200–3500 字、7–12 段。不是把短稿拉长,而是保留原文的论证层次、关键细节与转折;开头一段交代为什么值得花十分钟听它。\n\n标题:${c.title}\n来源:${c.sourceName}\n原文链接:${c.link}\n原文全文(Markdown,可能截断):\n${fullText.slice(0, DEEP_FULLTEXT_LIMIT)}\n\n注意:严格基于原文转述,不得添加原文没有的事实。判断适龄段：6-9 为小学低年级，10-12 为小学高年级，13-16 为初中。\n\n以 JSON 返回,格式为 {"title": "中文标题,凝练有余味", "intro": "一句话导语", "paragraphs": ["每段一个字符串"], "ageBands": ["10-12", "13-16"]}。`,
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
        const factChecked = await reviewScriptFacts(script, c, fullText);
        script.title = factChecked.script.title;
        script.intro = factChecked.script.intro;
        script.paragraphs = factChecked.script.paragraphs;
        script.title = await reviewTitle(script, c);
        pieces.push({
          slug: `${today}-${slugify(c.title)}`,
          title: script.title,
          category: ALL_CATS.includes(deep.category) ? deep.category : "humanities",
          author: "轻听编辑部",
          publishedAt: today,
          intro: script.intro,
          paragraphs: script.paragraphs,
          topics: Array.isArray(deep.topics) ? deep.topics : [],
          ageBands: normalizeAgeBands(script.ageBands, {
            fallback: ["13-16"],
            minAgeBand: c.minAgeBand,
          }),
          form: "long",
          shelf: "evergreen",
          source: {
            name: c.sourceName,
            url: c.link,
            originalTitle: c.title,
            lang: c.lang,
            profile: c.profile ?? "general",
            factReview: factChecked.audit,
          },
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

// 每天精选 1-2 篇中英双语：英文是基于同一完整原文的独立听稿，并接受与
// 中文稿相同的事实二审。按质量与领域排好全部合格候选，前一篇失败就继续
// 尝试下一篇，直到两篇成功或候选耗尽；低于 85 分和无全文稿始终不进入队列。
const bilingualPicks = rankBilingualCandidates(bilingualCandidates);
console.log(
  `双语候选 ${bilingualCandidates.length} → 尝试队列 ${bilingualPicks.length}: ${bilingualPicks.map((item) => item.c.title).join(" / ") || "无"}`,
);
let bilingualPublished = 0;
for (const bilingual of bilingualPicks) {
  if (bilingualPublished >= 2) break;
  try {
    const en = await chatJson(
      `You are a writer for "EasyListen", a daily listening digest. You rewrite articles as scripts meant to be heard, not read: conversational, linear reasoning, a hook at the start, an afterthought at the end. Never copy the original text verbatim; retell it in your own words with attribution-safe paraphrase.`,
      `Rewrite the following article as an English listening script (3-6 paragraphs, plain spoken English).\n\nTitle: ${bilingual.c.title}\nSource: ${bilingual.c.sourceName}\n${bilingual.material}\n\nReturn JSON: {"title": "concise English title", "intro": "one-sentence lead", "paragraphs": ["each paragraph as a string"]}`,
      `英文稿(${bilingual.c.title})`,
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
      const factChecked = await reviewScriptFacts(en, bilingual.c, bilingual.fullText);
      bilingual.piece.en = {
        title: factChecked.script.title,
        intro: factChecked.script.intro,
        paragraphs: factChecked.script.paragraphs,
        factReview: factChecked.audit,
      };
      bilingualPublished += 1;
      console.log(`wrote 英文稿: ${factChecked.script.title}`);
    } else {
      console.log(`英文稿格式不合格,跳过: ${bilingual.c.title}`);
    }
  } catch (e) {
    console.log(`英文稿生成失败(跳过): ${e.message}`);
  }
}
if (bilingualPublished < 1) {
  throw new Error("每日发布契约未满足：必须有 1-2 篇通过完整原文与事实二审的中英双语稿");
}

// 最新的排前面；同日重跑替换当天旧刊，避免手动测试或失败重试累加篇数。
if (pieces.length === 0) {
  throw new Error(
    "本期没有生成任何可发布听稿：不写入日刊和主编记录，让任务失败并保留自动重试能力。",
  );
}
const merged = mergeDailyPieces(pieces, existing, today);
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
