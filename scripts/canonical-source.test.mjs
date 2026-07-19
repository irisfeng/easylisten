import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalArticle } from "./lib/canonical-source.mjs";

test("聚合 RSS 的 More here 链接解析为原始发布者并移除追踪参数", () => {
  const result = resolveCanonicalArticle(
    `<p>Dan Werb at Literary Hub</p>
     <a href="https://3quarksdaily.com/image.jpg">image</a>
     <p>More <a href="https://lithub.com/welcome/?utm_source=x#top">here</a>.</p>`,
    "https://3quarksdaily.com/feed",
  );
  assert.deepEqual(result, {
    url: "https://lithub.com/welcome/",
    sourceName: "Literary Hub",
  });
});

test("没有可信外链时不把聚合页伪装成原始来源", () => {
  assert.equal(
    resolveCanonicalArticle(
      `<a href="https://3quarksdaily.com/another">站内文章</a>`,
      "https://3quarksdaily.com/feed",
    ),
    null,
  );
});

test("正文里的普通外部参考链接不能冒充原始来源", () => {
  assert.equal(
    resolveCanonicalArticle(
      `<p>参考 <a href="https://example.com/report">一份研究报告</a></p>`,
      "https://longreads.com/feed/",
    ),
    null,
  );
});
