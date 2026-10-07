import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { duplicateSlugs, uniquePieceSlug } from "./lib/piece-slug.mjs";

const date = "2026-10-07";

test("同一天两篇中文标题只剩相同数字时得到不同 slug", () => {
  const taken = new Set();
  const physics = uniquePieceSlug(
    { date, title: "刚刚，2026年诺贝尔物理奖揭晓！", url: "https://example.com/physics" },
    taken,
  );
  taken.add(physics);
  const medicine = uniquePieceSlug(
    { date, title: "2026 年诺贝尔生理学或医学奖授予了三位科学家", url: "https://example.com/medicine" },
    taken,
  );
  assert.notEqual(physics, medicine);
  assert.match(physics, /^2026-10-07-2026-[0-9a-f]{6}$/);
});

test("同一篇稿重跑得到相同 slug", () => {
  const piece = { date, title: "人工智能与教育", url: "https://example.com/a" };
  assert.equal(uniquePieceSlug(piece, new Set()), uniquePieceSlug(piece, new Set()));
});

test("足够长的英文标题保持可读 slug", () => {
  assert.equal(
    uniquePieceSlug({ date, title: "When We Were Prey", url: "https://example.com/prey" }, new Set()),
    "2026-10-07-when-we-were-prey",
  );
});

test("可读 slug 已被占用时附加哈希而不是覆盖", () => {
  const taken = new Set(["2026-10-07-when-we-were-prey"]);
  const slug = uniquePieceSlug(
    { date, title: "When We Were Prey", url: "https://example.com/other" },
    taken,
  );
  assert.match(slug, /^2026-10-07-when-we-were-prey-[0-9a-f]{6}$/);
});

test("连哈希都撞上时仍然唯一", () => {
  const piece = { date, title: "纯中文标题", url: "https://example.com/same" };
  const first = uniquePieceSlug(piece, new Set());
  assert.notEqual(uniquePieceSlug(piece, new Set([first])), first);
});

test("已发布内容里没有重复的 slug", () => {
  const read = (file) => JSON.parse(readFileSync(new URL(`../content/${file}`, import.meta.url), "utf8"));
  assert.deepEqual(duplicateSlugs([...read("daily.json"), ...read("seeds.json")]), []);
});
