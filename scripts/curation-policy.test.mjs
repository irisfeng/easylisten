import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  BILINGUAL_QUALITY_BAR,
  REGION_POOL_MIN_SHARE,
  buildCurationAttemptQueue,
  composeDailyPicks,
  hasVerifiableSource,
  mergeDailyPieces,
  mergeSupplementPieces,
  normalizeAgeBands,
  rankBilingualCandidates,
  regionCountsForPicks,
  selectCandidatePool,
  selectBilingualCandidates,
  selectPublishableEntries,
} from "./lib/curation-policy.mjs";
import {
  buildEvidenceBlocks,
  materializeEvidenceQuotes,
  stripEvidenceMarkersFromScript,
  validateFactReview,
} from "./lib/fact-review.mjs";

const editorialPolicy = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../content/editorial-policy.json"), "utf8"),
);

test("编辑策略版本已存档并与国内国际候选池规则同步", () => {
  assert.match(editorialPolicy.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(
    editorialPolicy.regionBalance.candidatePoolMinimumSharePerRegion,
    REGION_POOL_MIN_SHARE,
  );
});

test("事实二审通过编号选择证据并由代码回填原文精确引文", () => {
  const source = "Alpha is the first verified fact. Beta is the second verified fact. ".repeat(5);
  const blocks = buildEvidenceBlocks(source, { windowSize: 70, overlap: 20 });
  const review = materializeEvidenceQuotes(
    {
      final: {
        title: "Verified title",
        intro: "Verified intro",
        paragraphs: ["First paragraph.", "Second paragraph.", "Third paragraph."],
      },
      evidence: [0, 1, 2].map((paragraphIndex) => ({
        paragraphIndex,
        sourceId: blocks[paragraphIndex].id,
      })),
    },
    blocks,
  );

  assert.equal(review.evidence[0].sourceQuote, blocks[0].quote);
  assert.equal(validateFactReview(review, source).title, "Verified title");
});

test("不存在的证据编号不能绕过原文精确匹配闸门", () => {
  const source = "Only this source text is allowed. ".repeat(10);
  const review = materializeEvidenceQuotes(
    {
      final: {
        title: "Title",
        intro: "Intro",
        paragraphs: ["One.", "Two.", "Three."],
      },
      evidence: [0, 1, 2].map((paragraphIndex) => ({ paragraphIndex, sourceId: "E999" })),
    },
    buildEvidenceBlocks(source),
  );
  assert.throws(() => validateFactReview(review, source), /缺少可回查原文证据/);
});

test("内部证据编号不会进入正式听稿或音频文本", () => {
  const clean = stripEvidenceMarkersFromScript({
    title: "标题（E001）",
    intro: "导语(E002-E003)",
    paragraphs: ["事实（E014–E015）。", "另一事实（E019）。", "正常内容。"],
  });
  assert.equal(clean.title, "标题");
  assert.equal(clean.intro, "导语");
  assert.deepEqual(clean.paragraphs, ["事实。", "另一事实。", "正常内容。"]);
});

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
  assert.ok(selected.filter((candidate) => candidate.lang === "zh").length >= 30);
  assert.ok(selected.filter((candidate) => candidate.region === "mainland").length >= 27);
  assert.ok(selected.filter((candidate) => candidate.region !== "mainland").length >= 27);
  assert.ok(
    categories.every((category) =>
      selected.some((candidate) => candidate.category === category),
    ),
  );
  assert.ok(
    selected.filter((candidate) => candidate.profile === "realtime").length >= 12,
  );
});

test("评分池为国内国际保留近似均衡的候选面", () => {
  const categories = ["science", "tech", "society", "humanities", "living", "culture"];
  const candidates = Array.from({ length: 180 }, (_, index) => ({
    title: `candidate-${index}`,
    lang: index >= 90 ? "zh" : "en",
    category: categories[index % categories.length],
    profile: "depth",
    region: index >= 150 ? "mainland" : "international",
    weight: index >= 150 ? 0.8 : 1.2,
    resonance: 1,
    publishedAt: "2026-07-19T20:00:00+08:00",
  }));

  const selected = selectCandidatePool(candidates, 60, now);
  const mainland = selected.filter((candidate) => candidate.region === "mainland");
  const international = selected.filter((candidate) => candidate.region === "international");

  assert.equal(mainland.length, 27);
  assert.equal(international.length, 33);
  assert.ok(selected.filter((candidate) => candidate.lang === "zh").length >= 30);
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

test("补刊保留当日已发内容，只追加新稿且不重复", () => {
  const existing = [
    { slug: "today-domestic", publishedAt: "2026-07-21" },
    { slug: "today-international", publishedAt: "2026-07-21" },
    { slug: "yesterday", publishedAt: "2026-07-20" },
  ];
  const additions = [
    { slug: "today-domestic", publishedAt: "2026-07-21" },
    { slug: "new-one", publishedAt: "2026-07-21" },
    { slug: "new-two", publishedAt: "2026-07-21" },
    { slug: "new-three", publishedAt: "2026-07-21" },
  ];

  const merged = mergeSupplementPieces(additions, existing, "2026-07-21", 5);

  assert.deepEqual(
    merged.map((piece) => piece.slug),
    ["today-domestic", "today-international", "new-one", "new-two", "new-three", "yesterday"],
  );
});

test("一侧合格稿不足时允许另一侧多一篇，不会收缩到对称的两篇", () => {
  const candidates = [
    { sourceName: "科学网", region: "mainland" },
    { sourceName: "国际科学", region: "international" },
    { sourceName: "国际社会", region: "international" },
    { sourceName: "国际人文", region: "international" },
    { sourceName: "国际生活", region: "international" },
    { sourceName: "国际文化", region: "international" },
  ];
  const rawPicks = [
    { index: 0, score: 92, category: "tech" },
    { index: 1, score: 91, category: "science" },
    { index: 2, score: 90, category: "society" },
    { index: 3, score: 89, category: "humanities" },
    { index: 4, score: 88, category: "living" },
    { index: 5, score: 87, category: "culture" },
  ];

  const selected = composeDailyPicks(rawPicks, candidates);

  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map((pick) => pick.index), [0, 1, 2]);
});

test("双方都有足量合格稿时六篇 3+3、五篇 3+2", () => {
  const candidates = [
    { sourceName: "国际一", region: "international" },
    { sourceName: "国际二", region: "international" },
    { sourceName: "国际三", region: "international" },
    { sourceName: "国内一", region: "mainland" },
    { sourceName: "国内二", region: "mainland" },
    { sourceName: "国内三", region: "mainland" },
  ];
  const rawPicks = [
    { index: 0, score: 96, category: "tech" },
    { index: 1, score: 95, category: "science" },
    { index: 2, score: 94, category: "society" },
    { index: 3, score: 85, category: "humanities" },
    { index: 4, score: 84, category: "living" },
    { index: 5, score: 83, category: "culture" },
  ];

  const six = composeDailyPicks(rawPicks, candidates, { maxPicks: 6 });
  const five = composeDailyPicks(rawPicks, candidates, { maxPicks: 5 });

  assert.equal(six.length, 6);
  assert.equal(
    six.filter((pick) => candidates[pick.index].region === "mainland").length,
    3,
  );
  assert.equal(
    six.filter((pick) => candidates[pick.index].region === "international").length,
    3,
  );
  assert.equal(five.length, 5);
  assert.equal(
    five.filter((pick) => candidates[pick.index].region === "mainland").length,
    2,
  );
  assert.equal(
    five.filter((pick) => candidates[pick.index].region === "international").length,
    3,
  );
});

test("补刊编排会把新稿优先补到当日欠缺的地域", () => {
  const candidates = [
    { sourceName: "国际一", region: "international" },
    { sourceName: "国际二", region: "international" },
    { sourceName: "国内一", region: "mainland" },
    { sourceName: "国内二", region: "mainland" },
  ];
  const rawPicks = [
    { index: 0, score: 96, category: "tech" },
    { index: 1, score: 95, category: "science" },
    { index: 2, score: 84, category: "society" },
    { index: 3, score: 83, category: "culture" },
  ];

  const selected = composeDailyPicks(rawPicks, candidates, {
    maxPicks: 2,
    initialRegionCounts: { mainland: 2, international: 0 },
  });

  assert.deepEqual(selected.map((pick) => pick.index), [0, 1]);
});

test("补刊将当日已用来源和领域上限纳入编排", () => {
  const candidates = [
    { sourceName: "已用来源", region: "international" },
    { sourceName: "新科学源", region: "international" },
    { sourceName: "新人文源", region: "mainland" },
  ];
  const rawPicks = [
    { index: 0, score: 96, category: "culture" },
    { index: 1, score: 95, category: "science" },
    { index: 2, score: 84, category: "humanities" },
  ];

  const selected = composeDailyPicks(rawPicks, candidates, {
    maxPicks: 2,
    initialSources: ["已用来源"],
    initialCategoryCounts: { science: 2 },
  });

  assert.deepEqual(selected.map((pick) => pick.index), [2]);
});

test("补刊发布闸门按整期统计地域数量", () => {
  const candidates = [
    { region: "mainland" },
    { region: "international" },
    { region: "international" },
  ];

  assert.deepEqual(
    regionCountsForPicks(
      [{ index: 0 }, { index: 1 }, { index: 2 }],
      candidates,
      { mainland: 1, international: 1 },
    ),
    { mainland: 2, international: 3 },
  );
});
