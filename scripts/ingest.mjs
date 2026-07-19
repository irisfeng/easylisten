/**
 * 召回:拉取 content/sources.json 里的 RSS/Atom 源,归一化、去重、粗筛,
 * 输出候选池 content/candidates.json 供 curate.mjs 精选。
 *
 * 设计为在 GitHub Actions(网络不受限)中每日运行:
 *   node scripts/ingest.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCES = JSON.parse(readFileSync(resolve(ROOT, "content/sources.json"), "utf8")).sources;
const OUT = resolve(ROOT, "content/candidates.json");
const DAILY = resolve(ROOT, "content/daily.json");

const DEFAULT_MAX_AGE_DAYS = 3;
const MAX_PER_SOURCE = 10;

/** 极简 RSS/Atom 解析:MVP 用正则提取 item/entry 的关键字段,不引第三方依赖。 */
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decode(m[1].trim()) : "";
    };
    // Atom 的链接在 <link href="..."/>
    const linkAttr = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    items.push({
      title: strip(pick("title")),
      link: strip(pick("link")) || (linkAttr ? linkAttr[1] : ""),
      publishedAt: pick("pubDate") || pick("published") || pick("updated") || pick("dc:date"),
      summary: strip(pick("description") || pick("summary") || pick("content")).slice(0, 1200),
    });
  }
  return items;
}

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function strip(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeed(src) {
  const res = await fetch(src.feed, {
    headers: { "user-agent": "easylisten-ingest/1.0 (+https://github.com/irisfeng/easylisten)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
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
    const items = (await fetchFeed(src)).filter(
      (it) =>
        it.title &&
        it.link &&
        freshEnough(it.publishedAt, src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) &&
        !seenUrls.has(it.link),
    );
    for (const it of items.slice(0, MAX_PER_SOURCE)) {
      candidates.push({
        ...it,
        sourceName: src.name,
        category: src.category,
        lang: src.lang,
        weight: src.weight,
        profile: src.profile ?? "general",
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
