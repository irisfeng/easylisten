import assert from "node:assert/strict";
import test from "node:test";

import {
  BILINGUAL_QUALITY_BAR,
  selectCandidatePool,
  selectBilingualCandidates,
} from "./lib/curation-policy.mjs";

const now = Date.parse("2026-07-20T06:00:00+08:00");
const item = (title, score, options = {}) => ({
  c: {
    title,
    publishedAt: options.publishedAt ?? "2026-07-19T20:00:00+08:00",
    profile: options.profile ?? "depth",
    resonance: options.resonance ?? 1,
  },
  pick: { category: options.category ?? "science", topics: options.topics ?? [] },
  score,
  hasFullText: options.hasFullText ?? true,
});

test("双语只选完整原文且达到更高质量门槛的两篇", () => {
  const selected = selectBilingualCandidates(
    [
      item("低分", BILINGUAL_QUALITY_BAR - 1),
      item("只有摘要", 95, { hasFullText: false }),
      item("合格一", 90, { category: "science" }),
      item("合格二", 89, { category: "humanities" }),
      item("合格三", 88, { category: "living" }),
    ],
    now,
  );
  assert.deepEqual(selected.map((entry) => entry.c.title), ["合格一", "合格二"]);
});

test("48 小时内的重大实时事件优先获得双语稿，但仍保持领域多样性", () => {
  const selected = selectBilingualCandidates(
    [
      item("高分长青", 96, { category: "humanities", publishedAt: "2026-07-15T10:00:00Z" }),
      item("世界杯深度", 88, { category: "culture", profile: "realtime", topics: ["体育"] }),
      item("全球事件解释", 87, { category: "society", topics: ["全球时事"] }),
      item("同类体育二", 92, { category: "culture", profile: "realtime", topics: ["体育"] }),
    ],
    now,
  );
  assert.deepEqual(selected.map((entry) => entry.c.title), ["同类体育二", "全球事件解释"]);
});

test("评分池保留中文、领域和近 48 小时实时内容的可见性", () => {
  const categories = ["science", "tech", "society", "humanities", "living", "culture"];
  const candidates = Array.from({ length: 180 }, (_, index) => ({
    title: `candidate-${index}`,
    lang: index < 50 ? "zh" : "en",
    category: categories[index % categories.length],
    profile: index >= 160 ? "realtime" : "depth",
    weight: index < 140 ? 1.2 : 0.9,
    resonance: 1,
    publishedAt:
      index >= 160 ? "2026-07-19T20:00:00+08:00" : "2026-07-15T10:00:00+08:00",
  }));

  const selected = selectCandidatePool(candidates, 60, now);
  assert.equal(selected.length, 60);
  assert.ok(selected.filter((candidate) => candidate.lang === "zh").length >= 18);
  assert.ok(
    categories.every((category) =>
      selected.some((candidate) => candidate.category === category),
    ),
  );
  assert.ok(
    selected.filter((candidate) => candidate.profile === "realtime").length >= 12,
  );
});
