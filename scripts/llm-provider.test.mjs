import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredLlmProviders,
  isRetryableFinishReason,
  isRetryableProviderResponse,
  modelCandidatesFor,
} from "./lib/llm-provider.mjs";

test("DeepSeek 默认先尝试当前 v4 模型并保留旧模型兼容", () => {
  const [provider] = configuredLlmProviders({ DEEPSEEK_API_KEY: "test" });
  assert.deepEqual(modelCandidatesFor(provider), [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
  ]);
});

test("结构化输出被截断时允许切换供应商重新完成该任务", () => {
  assert.equal(isRetryableFinishReason("length"), true);
  assert.equal(isRetryableFinishReason("stop"), false);
});

test("显式模型覆盖优先但不移除供应商安全回退", () => {
  const [provider] = configuredLlmProviders({ DEEPSEEK_API_KEY: "test" });
  assert.deepEqual(modelCandidatesFor(provider, "custom-model"), [
    "custom-model",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
  ]);
});

test("只有模型兼容、限流和服务端错误允许切换模型或供应商", () => {
  assert.equal(
    isRetryableProviderResponse(
      400,
      "The supported API model names are deepseek-v4-pro or deepseek-v4-flash",
    ),
    true,
  );
  assert.equal(isRetryableProviderResponse(429, "rate limited"), true);
  assert.equal(isRetryableProviderResponse(503, "unavailable"), true);
  assert.equal(isRetryableProviderResponse(401, "bad key"), false);
  assert.equal(isRetryableProviderResponse(400, "bad JSON schema"), false);
});
