function compact(text) {
  return String(text ?? "")
    .replace(/\s+/g, "")
    .replace(/[“”‘’]/g, '"');
}

function draftText(script) {
  return [script?.title, script?.intro, ...(script?.paragraphs ?? [])].join("\n");
}

const AUDIT_LANGUAGE_PATTERNS = [
  /原文(?:未|没有)(?:说明|提供|提及|涉及|出现|列举|引述|写明|包含|披露|给出|支持|显示)/,
  /原文仅(?:明确)?(?:提及|说明|出现|包含|给出)/,
  /原文中找不到/,
  /(?:无|缺少)原文(?:依据|支撑|证据)/,
  /与原文不符/,
  /(?:撰稿人|模型)(?:的)?(?:演绎|推断|补充)/,
  /所有.+(?:描写|判断|内容).+无原文依据/,
  /\bthe (?:original )?(?:source|article) (?:does not|did not|doesn't) (?:mention|state|provide|include|explain|support)\b/i,
  /\bnot (?:mentioned|stated|provided|included|supported) in the (?:original )?(?:source|article)\b/i,
];

/**
 * 事实审稿过程可以讨论原文缺了什么，但正式听稿只能讲原文能够支持的事实。
 * 这类话术一旦进入 final，说明模型把审稿意见误写成了面向听众的正文。
 */
export function findPublishedAuditLanguage(script) {
  return [script?.title, script?.intro, ...(script?.paragraphs ?? [])]
    .map((text) => String(text ?? "").trim())
    .filter((text) => AUDIT_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text)));
}

/**
 * 把原文切成带稳定编号的重叠证据块。审稿模型只选择编号，最终引文由代码
 * 从原文回填，避免模型复制英文标点、空格或中文引号时制造“伪不匹配”。
 * 每一块仍是原文连续子串，后续精确匹配闸门保持不变。
 */
export function buildEvidenceBlocks(sourceText, { windowSize = 180, overlap = 40 } = {}) {
  const text = String(sourceText ?? "");
  if (!text.trim()) return [];
  const step = Math.max(1, windowSize - overlap);
  const blocks = [];
  for (let start = 0; start < text.length; start += step) {
    const quote = text.slice(start, Math.min(text.length, start + windowSize));
    if (!quote.trim()) continue;
    blocks.push({ id: `E${String(blocks.length + 1).padStart(3, "0")}`, quote });
    if (start + windowSize >= text.length) break;
  }
  return blocks;
}

export function materializeEvidenceQuotes(review, evidenceBlocks) {
  const byId = new Map(evidenceBlocks.map((block) => [block.id, block.quote]));
  return {
    ...review,
    evidence: (Array.isArray(review?.evidence) ? review.evidence : []).map((item) => ({
      ...item,
      sourceQuote:
        typeof item?.sourceId === "string" && byId.has(item.sourceId)
          ? byId.get(item.sourceId)
          : item?.sourceQuote,
    })),
  };
}

export function stripEvidenceMarkersFromScript(script) {
  const strip = (text) =>
    String(text).replace(
      /[（(]\s*E\d{3}(?:\s*[–—-]\s*E?\d{3})?(?:\s*[,，、]\s*E\d{3}(?:\s*[–—-]\s*E?\d{3})?)*\s*[）)]/g,
      "",
    );
  return {
    ...script,
    title: strip(script.title),
    intro: strip(script.intro),
    paragraphs: script.paragraphs.map(strip),
  };
}

function chineseNumber(value) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.includes("百")) {
    const [hundreds, rest = ""] = value.split("百");
    return (digits[hundreds] ?? 1) * 100 + (rest ? chineseNumber(rest.replace(/^零/, "")) : 0);
  }
  if (value.includes("十")) {
    const [tens, ones = ""] = value.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return Array.from(value).reduce((total, char) => total * 10 + (digits[char] ?? 0), 0);
}

function minuteFacts(text) {
  const values = new Set();
  for (const match of String(text).matchAll(/(?:第\s*)?(\d{1,3})\s*分钟/g)) {
    values.add(Number(match[1]));
  }
  for (const match of String(text).matchAll(/(?:第)?([零〇一二两三四五六七八九十百]{1,5})分钟/g)) {
    values.add(chineseNumber(match[1]));
  }
  return values;
}

/**
 * 对最危险、又能确定性核验的新闻事实做最后一道代码闸门。
 * 语义核验交给独立审稿模型；引语、分钟数和明确奖项不能只靠模型自觉。
 */
export function findUnsupportedHighRiskClaims(script, sourceText) {
  const draft = draftText(script);
  const source = compact(sourceText);
  const issues = [];

  for (const match of draft.matchAll(/[“"]([^”"\n]{4,})[”"]/g)) {
    if (!source.includes(compact(match[1]))) issues.push(`原文中找不到引语：${match[1]}`);
  }

  const sourceMinutes = minuteFacts(sourceText);
  for (const minute of minuteFacts(draft)) {
    if (!sourceMinutes.has(minute)) {
      issues.push(`原文中找不到第 ${minute} 分钟这一时间点`);
    }
  }

  const riskyPhrases = ["赛后被评为", "主教练也表示"];
  riskyPhrases.push(draft.includes("全场最佳球员") ? "全场最佳球员" : "全场最佳");
  for (const phrase of riskyPhrases) {
    if (draft.includes(phrase) && !source.includes(compact(phrase))) {
      issues.push(`原文中找不到高风险表述：${phrase}`);
    }
  }

  return [...new Set(issues)];
}

export function validateFactReview(review, sourceText) {
  const finalScript = review?.final;
  if (
    !finalScript ||
    typeof finalScript.title !== "string" ||
    typeof finalScript.intro !== "string" ||
    !Array.isArray(finalScript.paragraphs) ||
    finalScript.paragraphs.length < 3 ||
    finalScript.paragraphs.some((paragraph) => typeof paragraph !== "string" || !paragraph.trim())
  ) {
    throw new Error("事实二审没有返回完整听稿");
  }

  const leakedAuditLanguage = findPublishedAuditLanguage(finalScript);
  if (leakedAuditLanguage.length) {
    throw new Error(
      `审稿话术泄漏：${leakedAuditLanguage
        .slice(0, 3)
        .map((text) => text.slice(0, 60))
        .join("；")}`,
    );
  }

  const evidence = Array.isArray(review.evidence) ? review.evidence : [];
  const covered = new Set();
  const source = compact(sourceText);
  for (const item of evidence) {
    if (!Number.isInteger(item?.paragraphIndex)) continue;
    const quote = compact(item.sourceQuote);
    if (quote.length < 12 || !source.includes(quote)) continue;
    covered.add(item.paragraphIndex);
  }
  const missingEvidence = finalScript.paragraphs
    .map((_, index) => index)
    .filter((index) => !covered.has(index));
  if (missingEvidence.length) {
    throw new Error(`事实二审缺少可回查原文证据：第 ${missingEvidence.map((i) => i + 1).join("、")} 段`);
  }

  const deterministicIssues = findUnsupportedHighRiskClaims(finalScript, sourceText);
  if (deterministicIssues.length) throw new Error(deterministicIssues.join("；"));
  return finalScript;
}
