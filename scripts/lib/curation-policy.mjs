export const BILINGUAL_LIMIT = 2;
export const BILINGUAL_QUALITY_BAR = 85;
export const CHINESE_POOL_SHARE = 0.5;
export const MAINLAND_POOL_SHARE = 0.45;
export const REALTIME_POOL_SHARE = 0.2;
export const CATEGORY_POOL_MIN = 5;

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
