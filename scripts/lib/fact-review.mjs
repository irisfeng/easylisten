function compact(text) {
  return String(text ?? "")
    .replace(/\s+/g, "")
    .replace(/[“”‘’]/g, '"');
}

function draftText(script) {
  return [script?.title, script?.intro, ...(script?.paragraphs ?? [])].join("\n");
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
