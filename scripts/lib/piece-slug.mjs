import { createHash } from "node:crypto";

/**
 * 听稿 slug 同时是阅读页地址和音频目录名，必须全局唯一且同一篇稿重跑不变。
 *
 * 中文标题去掉非 ASCII 字符后常常只剩年份或数字(两篇诺贝尔奖稿都只剩
 * "2026")，所以 ASCII 部分太短时附上来源链接的短哈希；仍然撞名再继续加后缀。
 */
const MIN_READABLE_LENGTH = 8;

function asciiPart(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}

export function uniquePieceSlug({ date, title, url }, takenSlugs) {
  const ascii = asciiPart(title);
  const hash = createHash("sha1")
    .update(String(url || title || ""))
    .digest("hex")
    .slice(0, 6);
  const base =
    ascii.length >= MIN_READABLE_LENGTH ? ascii : ascii ? `${ascii}-${hash}` : hash;
  let slug = `${date}-${base}`;
  if (takenSlugs.has(slug) && !base.endsWith(hash)) slug = `${date}-${base}-${hash}`;
  for (let n = 2; takenSlugs.has(slug); n++) slug = `${date}-${base}-${hash}-${n}`;
  return slug;
}

/** 返回重复出现的 slug；发布前必须为空。 */
export function duplicateSlugs(pieces) {
  const seen = new Set();
  const duplicates = new Set();
  for (const { slug } of pieces) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  return [...duplicates];
}
