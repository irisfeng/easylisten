import assert from "node:assert/strict";
import test from "node:test";

import {
  CHINESE_FEMALE_VOICE,
  CHINESE_MALE_VOICE,
  chineseVoicePlan,
  missingChineseVoiceUnits,
} from "./lib/audio-policy.mjs";

test("每篇中文稿必须规划 MiniMax 男女两条声线", () => {
  assert.deepEqual(chineseVoicePlan("today-story"), [
    { unit: "today-story", gender: "f", voice: CHINESE_FEMALE_VOICE },
    { unit: "today-story-m", gender: "m", voice: CHINESE_MALE_VOICE },
  ]);
});

test("已有女声时仍把缺失男声列为发布前必补单元", () => {
  assert.deepEqual(
    missingChineseVoiceUnits(["story-a", "story-b"], ["story-a", "story-b", "story-b-m"]),
    ["story-a-m"],
  );
});
