import assert from "node:assert/strict";
import test from "node:test";

import { publishedUnitStatus } from "./lib/audio-publication.mjs";

const manifest = {
  slugs: ["2026-10-07-a", "2026-10-07-a-m"],
  timings: { "2026-10-07-a": [0, 1.5, 3.2], "2026-10-07-a-m": [0, 1.4] },
};

test("工作区有本轮生成的文件时按本地文件检查", () => {
  assert.equal(
    publishedUnitStatus({ manifest, unit: "2026-10-07-a", expectedSentences: 2, hasLocalFiles: true }),
    "local",
  );
});

test("已登记且时间轴与句数一致的音轨视为已在对象存储", () => {
  assert.equal(
    publishedUnitStatus({ manifest, unit: "2026-10-07-a", expectedSentences: 2, hasLocalFiles: false }),
    "published",
  );
});

test("正文句数变化后旧音轨不能冒充已发布", () => {
  assert.equal(
    publishedUnitStatus({ manifest, unit: "2026-10-07-a-m", expectedSentences: 2, hasLocalFiles: false }),
    "drifted",
  );
});

test("未登记的音轨是缺失", () => {
  assert.equal(
    publishedUnitStatus({ manifest, unit: "2026-10-07-b", expectedSentences: 2, hasLocalFiles: false }),
    "missing",
  );
  assert.equal(
    publishedUnitStatus({ manifest: {}, unit: "2026-10-07-b", expectedSentences: 2, hasLocalFiles: false }),
    "missing",
  );
});
