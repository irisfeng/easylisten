import assert from "node:assert/strict";
import test from "node:test";

import { fetchFullText } from "./lib/full-text.mjs";

const longText = "可核验原文".repeat(60);

test("Firecrawl 403 时回退到 Jina Reader", async () => {
  const requests = [];
  const text = await fetchFullText("https://example.com/story", {
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (requests.length === 1) return { ok: false, status: 403 };
      return { ok: true, text: async () => longText };
    },
    log: () => {},
  });

  assert.equal(text, longText);
  assert.deepEqual(requests, [
    "https://api.firecrawl.dev/v2/scrape",
    "https://r.jina.ai/https://example.com/story",
  ]);
});

test("两个全文服务都失败时返回 null", async () => {
  const text = await fetchFullText("https://example.com/story", {
    fetchImpl: async () => ({ ok: false, status: 403 }),
    log: () => {},
  });

  assert.equal(text, null);
});

test("不接受不足以核验的短摘要", async () => {
  let requestCount = 0;
  const text = await fetchFullText("https://example.com/story", {
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return { ok: true, json: async () => ({ markdown: "太短" }) };
      }
      return { ok: true, text: async () => "仍然太短" };
    },
    log: () => {},
  });

  assert.equal(text, null);
  assert.equal(requestCount, 2);
});
