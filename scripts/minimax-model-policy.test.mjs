import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MINIMAX_TTS_MODEL,
  estimateMiniMaxTtsCostCny,
  miniMaxTtsModelCandidates,
} from "./lib/minimax-model-policy.mjs";

test("正式 MiniMax 语音默认最新 Turbo，并按上一代和旧稳定版回退", () => {
  assert.equal(DEFAULT_MINIMAX_TTS_MODEL, "speech-2.8-turbo");
  assert.deepEqual(miniMaxTtsModelCandidates(), [
    "speech-2.8-turbo",
    "speech-2.6-turbo",
    "speech-02-turbo",
  ]);
});

test("显式 HD 配置在付费调用前被拒绝", () => {
  assert.throws(
    () => miniMaxTtsModelCandidates("speech-2.8-hd"),
    /只允许 Turbo 模型/,
  );
});

test("Turbo 与 HD 的官方按量价差进入成本估算", () => {
  assert.equal(estimateMiniMaxTtsCostCny(10_000, "speech-2.8-turbo"), 2);
  assert.equal(estimateMiniMaxTtsCostCny(10_000, "speech-2.8-hd"), 3.5);
});
