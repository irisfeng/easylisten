import assert from "node:assert/strict";
import test from "node:test";

import {
  CHINESE_FEMALE_VOICE,
  CHINESE_MALE_VOICE,
  ENGLISH_FEMALE_VOICE,
  audioPlanForPiece,
  latestIssuePieces,
  missingRequiredAudioUnits,
} from "./lib/audio-policy.mjs";

const chinesePiece = { slug: "today-story", paragraphs: ["中文正文。"] };

test("纯中文稿必须规划 MiniMax 男女两条声线", () => {
  assert.deepEqual(audioPlanForPiece(chinesePiece), [
    {
      unit: "today-story",
      language: "zh",
      gender: "f",
      engine: "minimax",
      voice: CHINESE_FEMALE_VOICE,
      paragraphs: chinesePiece.paragraphs,
    },
    {
      unit: "today-story-m",
      language: "zh",
      gender: "m",
      engine: "minimax",
      voice: CHINESE_MALE_VOICE,
      paragraphs: chinesePiece.paragraphs,
    },
  ]);
});

test("中英双语稿使用 MiniMax 中文女声和 Edge 英文女声", () => {
  const bilingual = {
    ...chinesePiece,
    en: { title: "Story", intro: "Intro", paragraphs: ["English body."] },
  };
  assert.deepEqual(audioPlanForPiece(bilingual), [
    {
      unit: "today-story",
      language: "zh",
      gender: "f",
      engine: "minimax",
      voice: CHINESE_FEMALE_VOICE,
      paragraphs: bilingual.paragraphs,
    },
    {
      unit: "today-story-en",
      language: "en",
      gender: "f",
      engine: "edge",
      voice: ENGLISH_FEMALE_VOICE,
      paragraphs: bilingual.en.paragraphs,
    },
  ]);
});

test("定向修复可以只选择双语稿的英文音轨", () => {
  const bilingual = {
    ...chinesePiece,
    en: { title: "Story", intro: "Intro", paragraphs: ["English body."] },
  };
  assert.deepEqual(
    audioPlanForPiece(bilingual, new Set(["today-story-en"])).map(({ unit }) => unit),
    ["today-story-en"],
  );
});

test("发布闸门按文章类型找出缺失音轨", () => {
  assert.deepEqual(
    missingRequiredAudioUnits(
      [
        { slug: "story-a", paragraphs: ["正文。"] },
        {
          slug: "story-b",
          paragraphs: ["正文。"],
          en: { paragraphs: ["Body."] },
        },
      ],
      ["story-a", "story-b"],
    ).map(({ unit }) => unit),
    ["story-a-m", "story-b-en"],
  );
});

test("默认每日任务只对最新一期执行新音频契约", () => {
  const pieces = [
    { ...chinesePiece, slug: "old", publishedAt: "2026-07-19" },
    { ...chinesePiece, slug: "today-zh", publishedAt: "2026-07-20" },
    {
      ...chinesePiece,
      slug: "today-en",
      publishedAt: "2026-07-20",
      en: { paragraphs: ["English body."] },
    },
  ];

  assert.deepEqual(
    latestIssuePieces(pieces).map((piece) => piece.slug),
    ["today-zh", "today-en"],
  );
});
