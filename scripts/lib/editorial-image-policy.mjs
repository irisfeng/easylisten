const SENSITIVE_PATTERN =
  /战争|战事|停火|空袭|轰炸|袭击|伤亡|死亡|灾难|地震|洪水|火灾|事故|犯罪|枪击|未成年|儿童医院|war|airstrike|bombing|attack|killed|disaster/i;

/** 新闻现场和敏感事件不自动生成图片，避免把编辑插图误当成事实影像。 */
export function isEditorialImageEligible(piece) {
  if (!piece?.slug || !piece?.title || !piece?.intro) return false;
  const text = [piece.title, piece.intro, ...(piece.topics ?? [])].join(" ");
  return !SENSITIVE_PATTERN.test(text);
}

export function normalizeImagePlan(raw, pieces, existingCount = 0, maxPerIssue = 2) {
  const capacity = Math.max(0, maxPerIssue - existingCount);
  if (capacity === 0) return [];
  const eligible = new Map(
    pieces.filter(isEditorialImageEligible).map((piece) => [piece.slug, piece]),
  );
  const seen = new Set();
  const selections = Array.isArray(raw?.selections) ? raw.selections : [];
  const normalized = [];

  for (const item of selections) {
    const piece = eligible.get(item?.slug);
    if (!piece || seen.has(piece.slug)) continue;
    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    const alt = typeof item.alt === "string" ? item.alt.trim() : "";
    const caption = typeof item.caption === "string" ? item.caption.trim() : "";
    if (!prompt || !alt || !caption) continue;
    seen.add(piece.slug);
    normalized.push({ piece, prompt, alt: alt.slice(0, 100), caption: caption.slice(0, 60) });
    if (normalized.length >= capacity) break;
  }
  return normalized;
}
