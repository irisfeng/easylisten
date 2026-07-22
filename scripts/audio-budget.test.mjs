import assert from "node:assert/strict";
import test from "node:test";

import {
  fitIssueEntriesToMiniMaxBudget,
  miniMaxCharsForPiece,
} from "./lib/audio-budget.mjs";

function entry(slug, region, score, { bilingual = false, chars = 1000 } = {}) {
  const piece = {
    slug,
    paragraphs: ["测".repeat(chars)],
    source: { region },
  };
  if (bilingual) piece.en = { paragraphs: ["English track uses Edge."] };
  return { piece, score };
}

test("MiniMax 预算按纯中文双声和双语中文单声精确计算", () => {
  assert.equal(miniMaxCharsForPiece(entry("zh", "mainland", 90).piece), 4000);
  assert.equal(
    miniMaxCharsForPiece(entry("bi", "international", 90, { bilingual: true }).piece),
    2000,
  );
});

test("六篇超预算时保留五篇最高质量且地域均衡并至少一篇双语", () => {
  const entries = [
    entry("i1", "international", 96),
    entry("i2", "international", 95),
    entry("i3", "international", 94),
    entry("m1", "mainland", 93),
    entry("m2", "mainland", 92),
    entry("m3-bi", "mainland", 80, { bilingual: true }),
  ];

  const selected = fitIssueEntriesToMiniMaxBudget(entries, {
    maxChars: 18_000,
    minPicks: 2,
    minBilingual: 1,
  });

  assert.equal(selected.length, 5);
  assert.ok(selected.some(({ piece }) => piece.en));
  assert.ok(
    Math.abs(
      selected.filter(({ piece }) => piece.source.region === "mainland").length -
        selected.filter(({ piece }) => piece.source.region !== "mainland").length,
    ) <= 1,
  );
  assert.ok(selected.reduce((sum, item) => sum + miniMaxCharsForPiece(item.piece), 0) <= 18_000);
});

test("最低篇数无法放入预算时明确拒绝出刊", () => {
  const entries = [
    entry("i-bi", "international", 96, { bilingual: true, chars: 3500 }),
    entry("m", "mainland", 95, { chars: 3500 }),
  ];

  assert.throws(
    () =>
      fitIssueEntriesToMiniMaxBudget(entries, {
        maxChars: 12_000,
        minPicks: 2,
        minBilingual: 1,
      }),
    /音频预算内无法保留至少 2 篇/,
  );
});
