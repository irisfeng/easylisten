const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const JINA_READER_URL = "https://r.jina.ai/";
const MIN_FULL_TEXT_LENGTH = 200;

function usableText(value) {
  return typeof value === "string" && value.trim().length >= MIN_FULL_TEXT_LENGTH
    ? value.trim()
    : null;
}

function readerUrl(url) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`不支持的原文协议: ${parsed.protocol}`);
  }
  return `${JINA_READER_URL}${parsed.href}`;
}

/**
 * 正式听稿需要足量原文。Firecrawl Keyless 是首选，遇到限流、403 或空响应时
 * 回退到 Jina Reader；两者都失败才放弃该篇，绝不拿 RSS 摘要冒充完整原文。
 */
export async function fetchFullText(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = 45000, log = console.log } = {},
) {
  try {
    const res = await fetchImpl(FIRECRAWL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const markdown = usableText(json?.data?.markdown ?? json?.markdown);
    if (!markdown) throw new Error("没有足量 Markdown");
    return markdown;
  } catch (error) {
    log(`firecrawl 抓取失败(${url}): ${error.message}`);
  }

  try {
    const res = await fetchImpl(readerUrl(url), {
      headers: {
        accept: "text/plain",
        "user-agent": "easylisten-curation/1.0 (+https://github.com/irisfeng/easylisten)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markdown = usableText(await res.text());
    if (!markdown) throw new Error("没有足量正文");
    log(`jina reader 回退成功(${url}): ${markdown.length} 字`);
    return markdown;
  } catch (error) {
    log(`jina reader 抓取失败(${url}): ${error.message}`);
    return null;
  }
}
