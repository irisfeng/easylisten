import assert from "node:assert/strict";
import test from "node:test";

import { normalizeForSpeech, splitSentences } from "../src/lib/speech-text.js";

test("小数点不会被当作句号切断", () => {
  assert.deepEqual(
    splitSentences([
      "质量是地球的5.26倍。WIYN 3.5米望远镜修正后为2.3倍。",
    ]),
    ["质量是地球的5.26倍。", "WIYN 3.5米望远镜修正后为2.3倍。"],
  );
});

test("中文朗读把小数和百分比改成无歧义读法", () => {
  assert.equal(
    normalizeForSpeech(
      "质量是地球的5.26倍，WIYN 3.5米望远镜修正后为2.3倍，辐射量约为90%。",
      "zh",
    ),
    "质量是地球的五点二六倍，WIYN 三点五米望远镜修正后为二点三倍，辐射量约为百分之九十。",
  );
});

test("中文朗读明确表达年份、时间、范围、比例、温度和算术符号", () => {
  assert.equal(
    normalizeForSpeech(
      "2024年，8:30，2.3～5.6，比例1:2，温度-3.5℃，误差±0.2，3×4=12。",
      "zh",
    ),
    "二零二四年，八点三十分，二点三到五点六，比例一比二，温度零下三点五摄氏度，误差正负零点二，三乘四等于十二。",
  );
});

test("英文朗读稿保持原文，交给英文音色处理", () => {
  const text = "In 2024, it rose 5.26% at 8:30.";
  assert.equal(normalizeForSpeech(text, "en"), text);
});

test("中文整数自然朗读，但型号中的数字保持原样", () => {
  assert.equal(
    normalizeForSpeech("GJ3378b距离地球25光年，周期21天，共2920天，PCSK9、SpaceX和X射线不变。", "zh"),
    "GJ3378b距离地球二十五光年，周期二十一天，共二千九百二十天，PCSK9、SpaceX和X射线不变。",
  );
});
