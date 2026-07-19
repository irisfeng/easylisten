/**
 * 召回:拉取 content/sources.json 里的 RSS/Atom 源,归一化、去重、粗筛,
 * 输出候选池 content/candidates.json 供 curate.mjs 精选。
 *
 * 设计为在 GitHub Actions(网络不受限)中每日运行:
 *   node scripts/ingest.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCanonicalArticle } from "./lib/canonical-source.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const ALL_SOURCES = JSON.parse(readFileSync(resolve(ROOT, "content/sources.json"), "utf8")).sources;
const sourceFilter = process.env.EASYLISTEN_SOURCE_FILTER;
const SOURCES = sourceFilter
  ? ALL_SOURCES.filter((source) => new RegExp(sourceFilter, "i").test(source.name))
  : ALL_SOURCES;
const OUT = resolve(ROOT, "content/candidates.json");
const DAILY = resolve(ROOT, "content/daily.json");

const DEFAULT_MAX_AGE_DAYS = 3;
const MAX_PER_SOURCE = 10;

/** 极简 RSS/Atom 解析:MVP 用正则提取 item/entry 的关键字段,不引第三方依赖。 */
function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decode(m[1].trim()) : "";
    };
    // Atom 的链接在 <link href="..."/>
    const linkAttr = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    const rawContent = pick("content:encoded") || pick("description") || pick("content");
    const canonical = source.resolveCanonical
      ? resolveCanonicalArticle(rawContent, source.feed)
      : null;
    items.push({
      title: strip(pick("title")),
      link: canonical?.url || strip(pick("link")) || (linkAttr ? linkAttr[1] : ""),
      publishedAt: pick("pubDate") || pick("published") || pick("updated") || pick("dc:date"),
      summary: strip(pick("description") || pick("summary") || pick("content")).slice(0, 1200),
      canonicalSourceName: canonical?.sourceName,
      discoveredVia: canonical ? source.name : undefined,
    });
  }
  return items;
}

function pickArticleTitle(html) {
  const propertyBlock = html.match(/<!--enpproperty([\s\S]*?)\/enpproperty-->/i)?.[1] ?? "";
  const propertyTitle = propertyBlock.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (propertyTitle) return strip(decode(propertyTitle));

  const metaTitle = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  if (metaTitle) return strip(decode(metaTitle));

  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (heading) return strip(decode(heading));

  return strip(decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""))
    .replace(/[_｜|—-].*$/, "")
    .trim();
}

function pickArticleSummary(html) {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const metaSummary = strip(decode(match?.[1] ?? "")).replace(/-$/, "");
  if (metaSummary.length >= 80) return metaSummary.slice(0, 1200);

  // 有些权威媒体的 description 只有标题，改从正文区取足量文本供主编评分。
  const articleBody =
    html.match(/id=["']detailContent["'][^>]*>([\s\S]*?)<div id=["']articleEdit["']/i)?.[1] ??
    "";
  return strip(decode(articleBody)).slice(0, 1200) || metaSummary.slice(0, 1200);
}

function parseSitemap(xml) {
  const blocks = xml.match(/<url[\s>][\s\S]*?<\/url>/gi) ?? [];
  return blocks.map((block) => ({
    link: strip(decode(block.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1] ?? "")),
    publishedAt: strip(
      decode(block.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1] ?? ""),
    ),
  }));
}

/**
 * 解析权威媒体频道页里的最新文章列表。
 * 目前用于新华体育，频道页比已经停用的旧 RSS 更新更稳定。
 */
function parseListing(html, baseUrl) {
  const blocks =
    html.match(/<div class="column-center-item[\s\S]*?<\/li><\/div>/gi) ?? [];
  return blocks
    .map((block) => {
      const href = block.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] ?? "";
      const title = strip(decode(block.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ""));
      const publishedAt = strip(
        decode(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ""),
      );
      try {
        return {
          title,
          link: href ? new URL(href, baseUrl).href : "",
          publishedAt: publishedAt ? `${publishedAt.replace(" ", "T")}+08:00` : "",
          summary: "",
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function strip(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeed(src) {
  const sourceLimit = Math.min(src.maxItems ?? MAX_PER_SOURCE, MAX_PER_SOURCE);
  const res = await fetch(src.feed, {
    headers: { "user-agent": "easylisten-ingest/1.0 (+https://github.com/irisfeng/easylisten)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (!src.format) return parseFeed(body, src);

  if (src.format === "listing") {
    const recent = parseListing(body, src.feed).filter(
      (item) =>
        item?.link && freshEnough(item.publishedAt, src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS),
    );
    if (src.preferPattern) {
      const preferred = new RegExp(src.preferPattern, "i");
      recent.sort(
        (a, b) => Number(preferred.test(b.title)) - Number(preferred.test(a.title)),
      );
    }
    recent.splice(sourceLimit * 2);
    const items = [];
    for (const item of recent) {
      if (items.length >= sourceLimit) break;
      try {
        const article = await fetch(item.link, {
          headers: { "user-agent": "easylisten-ingest/1.0 (+https://github.com/irisfeng/easylisten)" },
          signal: AbortSignal.timeout(15000),
        });
        if (!article.ok) continue;
        const html = await article.text();
        const title = pickArticleTitle(html) || item.title;
        if (title) items.push({ ...item, title, summary: pickArticleSummary(html) });
      } catch {
        // 单篇失败时继续检查频道里的下一篇，不让一个链接拖垮整个来源。
      }
    }
    return items;
  }

  if (src.format !== "sitemap") return parseFeed(body);

  const recent = parseSitemap(body)
    .filter(
      (item) =>
        item.link &&
        freshEnough(item.publishedAt, src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) &&
        (!src.includePattern || new RegExp(src.includePattern).test(item.link)),
    )
    .slice(0, sourceLimit * 2);
  const items = [];
  for (const item of recent) {
    if (items.length >= sourceLimit) break;
    try {
      const article = await fetch(item.link, {
        headers: { "user-agent": "easylisten-ingest/1.0 (+https://github.com/irisfeng/easylisten)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!article.ok) continue;
      const html = await article.text();
      const title = pickArticleTitle(html);
      if (title) items.push({ ...item, title, summary: pickArticleSummary(html) });
    } catch {
      // 单篇失败不拖垮整个权威来源；后续文章仍可进入候选池。
    }
  }
  return items;
}

function freshEnough(dateStr, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return true; // 没有日期的条目先放行,由精选阶段判断
  return Date.now() - t < maxAgeDays * 24 * 3600 * 1000;
}

const seenUrls = new Set(
  existsSync(DAILY)
    ? JSON.parse(readFileSync(DAILY, "utf8")).flatMap((p) => (p.source ? [p.source.url] : []))
    : [],
);

const candidates = [];
for (const src of SOURCES) {
  try {
    const sourceLimit = Math.min(src.maxItems ?? MAX_PER_SOURCE, MAX_PER_SOURCE);
    const items = (await fetchFeed(src)).filter(
      (it) =>
        it.title &&
        it.link &&
        freshEnough(it.publishedAt, src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) &&
        !seenUrls.has(it.link),
    );
    for (const it of items.slice(0, sourceLimit)) {
      candidates.push({
        ...it,
        sourceName: it.canonicalSourceName ?? src.name,
        category: src.category,
        lang: src.lang,
        weight: src.weight,
        profile: src.profile ?? "general",
        region: src.region ?? "international",
        publisher: it.canonicalSourceName ?? src.publisher ?? src.name,
        discoveredVia: it.discoveredVia,
        minAgeBand: src.minAgeBand,
      });
    }
    console.log(`ok   ${src.name}: ${items.length}`);
  } catch (e) {
    console.log(`fail ${src.name}: ${e.message}`);
  }
}

// 标题级去重(同一事件被多源报道时保留权重最高的一条,其余计为"共振",是热点信号)
const byTitle = new Map();
for (const c of candidates) {
  const key = c.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const prev = byTitle.get(key);
  if (!prev) byTitle.set(key, { ...c, resonance: 1 });
  else {
    prev.resonance += 1;
    if (c.weight > prev.weight) byTitle.set(key, { ...c, resonance: prev.resonance });
  }
}

const out = [...byTitle.values()];
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n${out.length} candidates → content/candidates.json`);
