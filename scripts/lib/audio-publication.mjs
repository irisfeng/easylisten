/**
 * 判断一条音轨在发布闸门里的状态。音频存放在对象存储而不是 git 仓库，所以
 * 此前已发布的音轨在 Actions 工作区里没有任何文件，只能以 manifest 为准：
 *
 * - local：本轮在工作区生成或续传，按本地文件逐项检查；
 * - published：manifest 已登记且时间轴与当前正文句数一致，已在对象存储；
 * - drifted：manifest 已登记，但正文句数变了，旧音频与正文对不上；
 * - missing：尚未生成。
 */
export function publishedUnitStatus({ manifest, unit, expectedSentences, hasLocalFiles }) {
  if (hasLocalFiles) return "local";
  if (!manifest.slugs?.includes(unit)) return "missing";
  const timingCount = manifest.timings?.[unit]?.length ?? 0;
  return timingCount === expectedSentences + 1 ? "published" : "drifted";
}
