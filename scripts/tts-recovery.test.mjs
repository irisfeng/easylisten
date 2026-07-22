import assert from "node:assert/strict";
import test from "node:test";

import { resolveProcessRetryPlan } from "./lib/process-recovery.mjs";
import { synthesizeWithRetries } from "./lib/tts-recovery.mjs";

test("完整音频契约使用分钟级退避并限制在声明的轮数内", () => {
  assert.deepEqual(resolveProcessRetryPlan({}), {
    attempts: 4,
    delaysMs: [60_000, 180_000, 600_000],
  });

  assert.deepEqual(
    resolveProcessRetryPlan({
      SYNTHESIS_PROCESS_ATTEMPTS: "3",
      SYNTHESIS_PROCESS_RETRY_DELAYS_MS: "1000, 2000, 3000",
    }),
    {
      attempts: 3,
      delaysMs: [1000, 2000],
    },
  );
});

test("Edge 返回空音频时自动重试同一音色", async () => {
  let calls = 0;
  const result = await synthesizeWithRetries({
    voices: ["en-US-AriaNeural"],
    attemptsPerVoice: 3,
    baseDelayMs: 0,
    synthesizeAttempt: async () => {
      calls += 1;
      return calls === 1 ? Buffer.alloc(0) : Buffer.from("valid-audio");
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.voice, "en-US-AriaNeural");
  assert.equal(result.audio.toString(), "valid-audio");
});

test("主音色持续失败后切换备用音色并报告实际音色", async () => {
  const calls = [];
  const result = await synthesizeWithRetries({
    voices: ["en-US-AriaNeural", "en-US-JennyNeural"],
    attemptsPerVoice: 2,
    baseDelayMs: 0,
    synthesizeAttempt: async (voice) => {
      calls.push(voice);
      if (voice === "en-US-AriaNeural") return Buffer.alloc(0);
      return Buffer.from("fallback-audio");
    },
  });

  assert.deepEqual(calls, [
    "en-US-AriaNeural",
    "en-US-AriaNeural",
    "en-US-JennyNeural",
  ]);
  assert.equal(result.voice, "en-US-JennyNeural");
  assert.equal(result.audio.toString(), "fallback-audio");
});
