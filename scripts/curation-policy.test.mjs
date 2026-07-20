import assert from "node:assert/strict";
import test from "node:test";

import {
  BILINGUAL_QUALITY_BAR,
  buildCurationAttemptQueue,
  composeDailyPicks,
  hasVerifiableSource,
  mergeDailyPieces,
  normalizeAgeBands,
  rankBilingualCandidates,
  selectCandidatePool,
  selectBilingualCandidates,
  selectPublishableEntries,
} from "./lib/curation-policy.mjs";

test("成人向优质来源的最低适龄段由代码兜底", () => {
  assert.deepEqual(
    normalizeAgeBands(["6-9", "10-12"], { minAgeBand: "10-12" }),
    ["10-12"],
  );
  assert.deepEqual(
    normalizeAgeBands(["6-9"], { minAgeBand: "13-16" }),
    ["13-16"],
  );
  assert.deepEqual(normalizeAgeBands(["6-9", "13-16"]), ["6-9", "13-16"]);
});

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

test("双语前两篇失败时仍保留同标准第三候选作为备份", () => {
  const ranked = rankBilingualCandidates(
    [
      item("合格一", 92, { category: "science" }),
      item("合格二", 91, { category: "humanities" }),
      item("合格三", 90, { category: "living" }),
      item("低分不进入备份", BILINGUAL_QUALITY_BAR - 1, { category: "culture" }),
    ],
    now,
  );
  assert.deepEqual(ranked.map((entry) => entry.c.title), ["合格一", "合格二", "合格三"]);
});

test("主名单失败后候补按相同门槛进入尝试队列", () => {
  const candidates = [
    { sourceName: "主源", region: "international" },
    { sourceName: "候补源一", region: "mainland" },
    { sourceName: "候补源二", region: "international" },
    { sourceName: "候补源二", region: "international" },
  ];
  const primary = [{ index: 0, score: 92, category: "science" }];
  const reserves = [
    { index: 1, score: 89, category: "humanities" },
    { index: 2, score: 84, category: "living" },
    { index: 3, score: 90, category: "culture" },
  ];

  const queue = buildCurationAttemptQueue(primary, reserves, candidates);
  assert.deepEqual(queue.map((pick) => pick.index), [0, 1, 2]);

  const publishable = selectPublishableEntries(
    queue.slice(1).map((pick) => ({ pick, marker: `draft-${pick.index}` })),
    candidates,
  );
  assert.deepEqual(publishable.map((entry) => entry.marker), ["draft-1", "draft-2"]);
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
    lang: index < 50 || index >= 120 ? "zh" : "en",
    category: categories[index % categories.length],
    profile: index >= 160 ? "realtime" : "depth",
    region: index >= 120 ? "mainland" : "international",
    weight: index < 140 ? 1.2 : 0.9,
    resonance: 1,
    publishedAt:
      index >= 160 ? "2026-07-19T20:00:00+08:00" : "2026-07-15T10:00:00+08:00",
  }));

  const selected = selectCandidatePool(candidates, 60, now);
  assert.equal(selected.length, 60);
  assert.ok(selected.filter((candidate) => candidate.lang === "zh").length >= 18);
  assert.ok(selected.filter((candidate) => candidate.region === "mainland").length >= 27);
  assert.ok(
    categories.every((category) =>
      selected.some((candidate) => candidate.category === category),
    ),
  );
  assert.ok(
    selected.filter((candidate) => candidate.profile === "realtime").length >= 12,
  );
});

test("正式听稿要求标准来源、原文标题、可访问链接和足量全文", () => {
  const candidate = {
    sourceName: "科学网",
    title: "为什么星星会闪烁",
    link: "https://example.com/science/story",
  };
  assert.equal(hasVerifiableSource(candidate, "完整原文".repeat(100)), true);
  assert.equal(hasVerifiableSource({ ...candidate, sourceName: "" }, "完整原文".repeat(100)), false);
  assert.equal(hasVerifiableSource({ ...candidate, title: "" }, "完整原文".repeat(100)), false);
  assert.equal(hasVerifiableSource({ ...candidate, link: "not-a-url" }, "完整原文".repeat(100)), false);
  assert.equal(hasVerifiableSource(candidate, "只有摘要"), false);
});

test("同一天重跑会替换旧刊而不是继续追加", () => {
  const existing = [
    { slug: "old-today-1", publishedAt: "2026-07-20" },
    { slug: "old-today-2", publishedAt: "2026-07-20" },
    { slug: "yesterday", publishedAt: "2026-07-19" },
  ];
  const fresh = [
    { slug: "new-today-1", publishedAt: "2026-07-20" },
    { slug: "new-today-2", publishedAt: "2026-07-20" },
  ];

  const merged = mergeDailyPieces(fresh, existing, "2026-07-20");

  assert.deepEqual(
    merged.map((piece) => piece.slug),
    ["new-today-1", "new-today-2", "yesterday"],
  );
});

test("节目单强制同源去重并在有合格国内稿时保持至少一半", () => {
  const candidates = [
    { sourceName: "国际科技", region: "international" },
    { sourceName: "科学网", region: "mainland" },
    { sourceName: "国际体育", region: "international" },
    { sourceName: "国际体育", region: "international" },
    { sourceName: "中新网", region: "mainland" },
  ];
  const rawPicks = [
    { index: 0, score: 92, category: "tech" },
    { index: 1, score: 91, category: "science" },
    { index: 2, score: 90, category: "culture" },
    { index: 3, score: 89, category: "culture" },
    { index: 4, score: 88, category: "humanities" },
  ];

  const selected = composeDailyPicks(rawPicks, candidates);

  assert.deepEqual(selected.map((pick) => pick.index), [0, 1, 2, 4]);
  assert.equal(
    selected.filter((pick) => candidates[pick.index].region === "mainland").length,
    2,
  );
  assert.equal(new Set(selected.map((pick) => candidates[pick.index].sourceName)).size, 4);
});

test("国内稿即使排在模型提名末尾也会获得主场席位", () => {
  const candidates = [
    { sourceName: "国际一", region: "international" },
    { sourceName: "国际二", region: "international" },
    { sourceName: "国际三", region: "international" },
    { sourceName: "国际四", region: "international" },
    { sourceName: "国内一", region: "mainland" },
    { sourceName: "国内二", region: "mainland" },
  ];
  const rawPicks = [
    { index: 0, score: 96, category: "tech" },
    { index: 1, score: 95, category: "science" },
    { index: 2, score: 94, category: "society" },
    { index: 3, score: 93, category: "humanities" },
    { index: 4, score: 84, category: "living" },
    { index: 5, score: 83, category: "culture" },
  ];

  const selected = composeDailyPicks(rawPicks, candidates, { maxPicks: 4 });

  assert.equal(selected.length, 4);
  assert.equal(
    selected.filter((pick) => candidates[pick.index].region === "mainland").length,
    2,
  );
});
