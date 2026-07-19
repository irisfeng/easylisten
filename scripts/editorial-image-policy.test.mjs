import test from "node:test";
import assert from "node:assert/strict";
import {
  isEditorialImageEligible,
  normalizeImagePlan,
} from "./lib/editorial-image-policy.mjs";

const safePieces = [
  { slug: "energy", title: "秸秆如何变成电", intro: "理解生物质能源", topics: ["气候与能源"] },
  { slug: "painting", title: "从自然学习中国画", intro: "观察笔墨与山水", topics: ["艺术与设计"] },
  { slug: "food", title: "吃饭时喝水会怎样", intro: "一项饮食实验", topics: ["健康与医学"] },
];

test("敏感现场新闻不会进入自动配图", () => {
  assert.equal(
    isEditorialImageEligible({ slug: "war", title: "停火后再遭空袭", intro: "战事继续" }),
    false,
  );
  assert.equal(isEditorialImageEligible(safePieces[0]), true);
});

test("每期最多两张且已有图片会占用额度", () => {
  const raw = {
    selections: safePieces.map((piece) => ({
      slug: piece.slug,
      prompt: `为${piece.title}生成编辑插图`,
      alt: `${piece.title}的编辑插图`,
      caption: piece.intro,
    })),
  };
  assert.deepEqual(normalizeImagePlan(raw, safePieces).map((item) => item.piece.slug), ["energy", "painting"]);
  assert.equal(normalizeImagePlan(raw, safePieces, 1).length, 1);
  assert.equal(normalizeImagePlan(raw, safePieces, 2).length, 0);
});

test("未知稿件、重复稿件和缺少说明的计划会被丢弃", () => {
  const raw = {
    selections: [
      { slug: "unknown", prompt: "x", alt: "x", caption: "x" },
      { slug: "energy", prompt: "x", alt: "x", caption: "x" },
      { slug: "energy", prompt: "x", alt: "x", caption: "x" },
      { slug: "food", prompt: "", alt: "x", caption: "x" },
    ],
  };
  assert.deepEqual(normalizeImagePlan(raw, safePieces).map((item) => item.piece.slug), ["energy"]);
});
