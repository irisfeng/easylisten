import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMiniMaxTextOptions,
  buildPronunciationDictionary,
  normalizeForSpeech,
  findSpeechNormalizationIssues,
  splitSentences,
} from "../src/lib/speech-text.js";

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

test("年份范围、缩写年份、年代和世纪始终按时间语义朗读", () => {
  assert.equal(
    normalizeForSpeech(
      "1941年、1943—1944年、2015–16年、20世纪40年代和1980年代。",
      "zh",
    ),
    "一九四一年、一九四三到一九四四年、二零一五到二零一六年、二十世纪四十年代和二十世纪八十年代。",
  );
});

test("日期、货币、货币范围和分数使用稳定中文读法", () => {
  assert.equal(
    normalizeForSpeech(
      "日期2026-07-23，预算US$1,250.50，票价$5–$10、￥4.5万元、€9、£12，完成1/3。",
      "zh",
    ),
    "日期二零二六年七月二十三日，预算一千二百五十点五零美元，票价五到十美元、四点五万元、九欧元、十二英镑，完成三分之一。",
  );
});

test("中文 TTS 预检拦截未规范化数字和货币符号但允许型号", () => {
  assert.deepEqual(findSpeechNormalizationIssues("1943—1944年，约$5。", "zh"), []);
  assert.deepEqual(findSpeechNormalizationIssues("型号GJ3378b保持不变。", "zh"), []);
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

test("为全大写缩写和字母数字型号生成 MiniMax 发音词典", () => {
  assert.deepEqual(
    buildPronunciationDictionary(
      "AI、FDA、PCSK9、GJ3378b和WIYN需要逐字母读；DeepMind、SpaceX保持自然读法。",
    ),
    [
      "AI/A I",
      "FDA/F D A",
      "PCSK9/P C S K 九",
      "GJ3378b/G J 三 三 七 八 B",
      "WIYN/W I Y N",
    ],
  );
});

test("固定发音词典优先于自动缩写规则，且只发送当前句需要的条目", () => {
  assert.deepEqual(
    buildPronunciationDictionary("轻听讨论AI。", [
      "轻听/(qing1)(ting1)",
      "AI/人工智能",
      "不在本句/(bu2)(zai4)(ben3)(ju4)",
    ]),
    ["轻听/(qing1)(ting1)", "AI/人工智能"],
  );
});

test("MiniMax 中文请求启用语言增强并按需携带发音词典", () => {
  assert.deepEqual(buildMiniMaxTextOptions("FDA批准。"), {
    language_boost: "Chinese",
    pronunciation_dict: { tone: ["FDA/F D A"] },
  });
  assert.deepEqual(buildMiniMaxTextOptions("这是一句普通中文。"), {
    language_boost: "Chinese",
  });
});

test("MiniMax 英文兜底启用英文增强和数字规范化且不携带中文词典", () => {
  assert.deepEqual(buildMiniMaxTextOptions("It rose 5.26%.", [], "en"), {
    language_boost: "English",
    english_normalization: true,
  });
});
