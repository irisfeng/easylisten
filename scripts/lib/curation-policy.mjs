export const CHINESE_POOL_SHARE = 0.5;
export const MAINLAND_POOL_SHARE = 0.45;
export const REALTIME_POOL_SHARE = 0.2;
export const CATEGORY_POOL_MIN = 5;
export const AGE_BANDS = ["6-9", "10-12", "13-16"];
export const BILINGUAL_LIMIT = 2;
export const BILINGUAL_QUALITY_BAR = 85;

/**
 * 模型逐篇判断适龄段，来源配置只提供保守下限。高质量成人刊物不等于低龄适配；
 * 即使模型误标，代码也不会让内容落到来源下限以下。
 */
export function normalizeAgeBands(
  value,
  { fallback = AGE_BANDS, minAgeBand } = {},
) {
  const floor = AGE_BANDS.indexOf(minAgeBand);
  const allowed = floor >= 0 ? AGE_BANDS.slice(floor) : AGE_BANDS;
  const valid = Array.isArray(value)
    ? [...new Set(value.filter((band) => allowed.includes(band)))]
    : [];
  if (valid.length) return valid;
  if (floor >= 0) return [minAgeBand];
  const validFallback = fallback.filter((band) => allowed.includes(band));
  return validFallback.length ? validFallback : AGE_BANDS;
}

/**
 * 同一天的手动重跑或失败重试必须替换当天旧刊，不能继续追加。
 * 这样日刊数量上限和首页“今日”语义在重复执行后仍然成立。
 */
export function mergeDailyPieces(pieces, existing, issueDate, limit = 60) {
  const previousIssues = existing.filter((piece) => piece.publishedAt !== issueDate);
  return [...pieces, ...previousIssues].slice(0, limit);
}

/**
 * 把模型提名收紧为可发布节目单。模型负责判断内容质量，代码负责不可妥协的
 * 结构约束：质量门槛、同源去重、领域上限，以及有合格国内稿时的主场占比。
 * 国内稿不足时宁可少发，不用低分稿补配额。
 */
export function composeDailyPicks(
  rawPicks,
  candidates,
  { qualityBar = 80, minPicks = 2, maxPicks = 6 } = {},
) {
  const eligible = rawPicks
    .map((pick, order) => ({ pick, order, candidate: candidates[pick.index] }))
    .filter(
      ({ pick, candidate }) =>
        candidate && Number.isInteger(pick.score) && pick.score >= qualityBar,
    )
    .sort((a, b) => b.pick.score - a.pick.score || a.order - b.order);

  const selected = [];
  const sources = new Set();
  const categoryCounts = new Map();
  const add = (entry) => {
    const source = entry.candidate.sourceName;
    const category = entry.pick.category;
    if (sources.has(source) || (categoryCounts.get(category) ?? 0) >= 2) return false;
    selected.push(entry);
    sources.add(source);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    return true;
  };

  // 先为合格国内稿预留一半席位，避免模型排序靠前的国际稿先占满节目单。
  const mainlandTarget = Math.ceil(maxPicks / 2);
  for (const entry of eligible.filter(({ candidate }) => candidate.region === "mainland")) {
    if (selected.length >= mainlandTarget) break;
    add(entry);
  }
  for (const entry of eligible) {
    if (selected.length >= maxPicks) break;
    add(entry);
  }

  const hasMainland = eligible.some(({ candidate }) => candidate.region === "mainland");
  while (
    hasMainland &&
    selected.length > minPicks &&
    selected.filter(({ candidate }) => candidate.region === "mainland").length <
      Math.ceil(selected.length / 2)
  ) {
    const international = selected
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.candidate.region !== "mainland")
      .sort((a, b) => a.entry.pick.score - b.entry.pick.score || b.index - a.index)[0];
    if (!international) break;
    selected.splice(international.index, 1);
  }

  return selected.sort((a, b) => a.order - b.order).map(({ pick }) => pick);
}

/** 正式听稿必须能回到标准来源，并且已经取得足量原文供事实核验。 */
export function hasVerifiableSource(candidate, fullText) {
  if (!candidate?.sourceName?.trim() || !candidate?.title?.trim()) return false;
  try {
    const url = new URL(candidate.link);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
  } catch {
    return false;
  }
  return typeof fullText === "string" && fullText.trim().length >= 200;
}

function ageHours(publishedAt, now) {
  const timestamp = Date.parse(publishedAt);
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3600000) : Infinity;
}

function timelyDepthSignal(item, now) {
  const topics = Array.isArray(item.pick?.topics) ? item.pick.topics : [];
  const eventTopic = topics.includes("全球时事") || topics.includes("体育");
  const eventSource = item.c?.profile === "realtime" || (item.c?.resonance ?? 1) > 1;
  return ageHours(item.c?.publishedAt, now) <= 48 && (eventTopic || eventSource);
}

/**
 * 双语稿不是配额：必须高于日刊门槛且抓到完整原文。排序优先重大事件的
 * 深度材料，再看分数与新鲜度；贪心时优先覆盖不同领域，避免两篇同质热点。
 */
export function selectBilingualCandidates(items, now = Date.now()) {
  const eligible = items
    .filter((item) => item.hasFullText && item.score >= BILINGUAL_QUALITY_BAR)
    .sort(
      (a, b) =>
        Number(timelyDepthSignal(b, now)) - Number(timelyDepthSignal(a, now)) ||
        b.score - a.score ||
        ageHours(a.c?.publishedAt, now) - ageHours(b.c?.publishedAt, now),
    );

  const selected = [];
  for (const item of eligible) {
    if (selected.length >= BILINGUAL_LIMIT) break;
    if (selected.some((chosen) => chosen.pick?.category === item.pick?.category)) continue;
    selected.push(item);
  }
  for (const item of eligible) {
    if (selected.length >= BILINGUAL_LIMIT) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected;
}

function candidateTimestamp(candidate) {
  const timestamp = Date.parse(candidate?.publishedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareCandidates(a, b) {
  return (
    (b.resonance ?? 1) - (a.resonance ?? 1) ||
    (b.weight ?? 1) - (a.weight ?? 1) ||
    candidateTimestamp(b) - candidateTimestamp(a)
  );
}

/**
 * 候选过多时先保证中文、六领域和实时事件有进入评分池的机会,
 * 再按共振、源权重和新鲜度填满。这只是召回层保护,不代表入选配额。
 */
export function selectCandidatePool(items, limit = 120, now = Date.now()) {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const ranked = [...items].sort(compareCandidates);
  if (ranked.length <= limit) return ranked;

  const selected = [];
  const seen = new Set();
  const take = (predicate, count) => {
    let added = 0;
    for (const item of ranked) {
      if (selected.length >= limit || added >= count) break;
      if (!seen.has(item) && predicate(item)) {
        seen.add(item);
        selected.push(item);
        added += 1;
      }
    }
  };

  const ensure = (predicate, count) => {
    const current = selected.filter(predicate).length;
    take(predicate, Math.max(0, count - current));
  };

  ensure((item) => item.region === "mainland", Math.ceil(limit * MAINLAND_POOL_SHARE));
  ensure((item) => item.lang === "zh", Math.ceil(limit * CHINESE_POOL_SHARE));
  for (const category of ["science", "tech", "society", "humanities", "living", "culture"]) {
    ensure((item) => item.category === category, CATEGORY_POOL_MIN);
  }
  ensure(
    (item) =>
      item.profile === "realtime" &&
      ageHours(item.publishedAt, now) <= 48,
    Math.ceil(limit * REALTIME_POOL_SHARE),
  );
  take(() => true, limit);

  return selected.sort(compareCandidates);
}
