/**
 * 全量审计公开 RSS 目录。默认检查 top-rss-list 的中文区：
 *   npm run audit:sources
 *
 * 只做发现与技术验活，不自动写入 content/sources.json。最终准入仍须人工判断
 * 发布者身份、少年适配与单篇质量，避免“能抓到”被误当成“值得收录”。
 */

const CATALOG_URL =
  process.argv[2] ??
  "https://raw.githubusercontent.com/weekend-project-space/top-rss-list/main/README.md";
const CONCURRENCY = 12;
const TIMEOUT_MS = 15_000;
const STALE_DAYS = 180;

const THIRD_PARTY_HOSTS = new Set([
  "rsshub.app",
  "plink.anyfeeder.com",
  "feeds.feedburner.com",
  "feeds2.feedburner.com",
  "feed43.com",
  "node2.feed43.com",
]);

function extractCatalog(markdown) {
  const rows = [];
  const rowPattern = /^\|\s*([^|]+?)\s*\|\s*\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    rows.push({ name: match[1].trim(), url: match[2].trim() });
  }
  return rows;
}

function parseEntries(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const dates = [];
  for (const block of blocks.slice(0, 50)) {
    const match = block.match(
      /<(?:pubDate|published|updated|dc:date)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|published|updated|dc:date)>/i,
    );
    const timestamp = match ? Date.parse(match[1].trim()) : NaN;
    if (Number.isFinite(timestamp)) dates.push(timestamp);
  }
  return { count: blocks.length, latestAt: dates.length ? Math.max(...dates) : null };
}

function proxyReason(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (THIRD_PARTY_HOSTS.has(host)) return host;
  if (host.endsWith(".rsshub.app") || host.includes("anyfeeder")) return host;
  if (host.includes("my-rssh") || host.includes("rss-proxy")) return host;
  return null;
}

async function audit(row) {
  const proxy = proxyReason(row.url);
  if (proxy) return { ...row, status: "reject-proxy", reason: proxy };
  if (!row.url.startsWith("https://")) {
    return { ...row, status: "reject-insecure", reason: "HTTP only" };
  }

  try {
    const response = await fetch(row.url, {
      headers: { "user-agent": "easylisten-source-audit/1.0 (+https://github.com/irisfeng/easylisten)" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ...row, status: "dead", reason: `HTTP ${response.status}` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const entries = parseEntries(text);
    if (entries.count === 0) {
      return { ...row, status: "not-feed", reason: contentType || "no item/entry" };
    }
    const ageDays = entries.latestAt
      ? Math.floor((Date.now() - entries.latestAt) / 86_400_000)
      : null;
    if (ageDays !== null && ageDays > STALE_DAYS) {
      return { ...row, status: "stale", entries: entries.count, ageDays };
    }
    return {
      ...row,
      status: "technical-pass",
      entries: entries.count,
      ageDays,
      finalUrl: response.url,
    };
  } catch (error) {
    return {
      ...row,
      status: "dead",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapConcurrent(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  let completed = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      completed += 1;
      if (completed % 25 === 0 || completed === items.length) {
        console.error(`audited ${completed}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

const markdown = await fetch(CATALOG_URL, {
  headers: { "user-agent": "easylisten-source-audit/1.0" },
  signal: AbortSignal.timeout(TIMEOUT_MS),
}).then((response) => {
  if (!response.ok) throw new Error(`目录拉取失败: HTTP ${response.status}`);
  return response.text();
});

const rows = extractCatalog(markdown);
const unique = [];
const seen = new Set();
for (const row of rows) {
  if (!seen.has(row.url)) {
    seen.add(row.url);
    unique.push(row);
  }
}

const results = await mapConcurrent(unique, audit, CONCURRENCY);
const counts = {};
for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;

const report = {
  catalog: CATALOG_URL,
  rows: rows.length,
  unique: unique.length,
  duplicates: rows.length - unique.length,
  counts,
  technicalPass: results.filter((result) => result.status === "technical-pass"),
  rejectedOrWatch: results.filter((result) => result.status !== "technical-pass"),
};

if (process.env.EASYLISTEN_AUDIT_SUMMARY === "1") {
  console.log(JSON.stringify({
    catalog: report.catalog,
    rows: report.rows,
    unique: report.unique,
    duplicates: report.duplicates,
    counts: report.counts,
    technicalPass: report.technicalPass.map(({ name, url, entries, ageDays }) => ({
      name,
      url,
      entries,
      ageDays,
    })),
  }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
