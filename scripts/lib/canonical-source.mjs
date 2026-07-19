const SOURCE_NAMES = new Map([
  ["lithub.com", "Literary Hub"],
  ["longreads.com", "Longreads"],
  ["aeon.co", "Aeon"],
  ["theguardian.com", "The Guardian"],
  ["nytimes.com", "The New York Times"],
  ["newyorker.com", "The New Yorker"],
  ["theatlantic.com", "The Atlantic"],
]);

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** 聚合型 RSS 只负责发现，正式来源必须指向它所推荐的第一发布页面。 */
export function resolveCanonicalArticle(html, discoveryUrl) {
  let discoveryHost;
  try {
    discoveryHost = new URL(discoveryUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const links = [];
  for (const match of String(html ?? "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], discoveryUrl);
      const host = url.hostname.replace(/^www\./, "");
      if (!['http:', 'https:'].includes(url.protocol) || host === discoveryHost) continue;
      if (/\.(?:jpg|jpeg|png|gif|webp|svg)(?:$|\?)/i.test(url.pathname)) continue;
      const label = stripTags(match[2]);
      const score = /^(?:more|here|read(?: the)? (?:story|article)|continue reading)$/i.test(label)
        ? 10
        : 1;
      links.push({ url, host, score });
    } catch {
      // 略过无法解析的广告、脚本和相对碎片链接。
    }
  }
  links.sort((a, b) => b.score - a.score);
  const chosen = links[0];
  // 普通正文外链可能只是参考资料或广告；只有明确的“继续阅读原文”锚文本
  // 才允许改写来源，宁可保留聚合页也不能跳到错误发布者。
  if (!chosen || chosen.score < 10) return null;
  chosen.url.search = "";
  chosen.url.hash = "";
  return {
    url: chosen.url.href,
    sourceName: SOURCE_NAMES.get(chosen.host) ?? chosen.host,
  };
}
