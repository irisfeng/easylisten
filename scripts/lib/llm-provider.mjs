const PROVIDER_DEFINITIONS = [
  {
    env: "DEEPSEEK_API_KEY",
    base: "https://api.deepseek.com/v1",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"],
  },
  {
    env: "DASHSCOPE_API_KEY",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus"],
  },
  {
    env: "OPENAI_API_KEY",
    base: "https://api.openai.com/v1",
    models: ["gpt-4o-mini"],
  },
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function configuredLlmProviders(env = process.env) {
  return PROVIDER_DEFINITIONS.filter((provider) => env[provider.env]).map((provider) => ({
    ...provider,
    base:
      provider.env === "OPENAI_API_KEY" && env.LLM_BASE_URL
        ? env.LLM_BASE_URL
        : provider.base,
  }));
}

export function modelCandidatesFor(provider, override = "") {
  return unique([override, ...(provider?.models ?? [])]);
}

export function isRetryableProviderResponse(status, body = "") {
  if (status === 429 || status >= 500) return true;
  if (status !== 400) return false;
  return /model|模型|unsupported|not supported|invalid_request_error/i.test(body);
}

export function isRetryableFinishReason(reason) {
  return reason === "length";
}

/**
 * 上游偶尔会返回 HTTP 200 但不给 choices/content。这不是稿件问题，应该像
 * 5xx 一样切换模型或供应商；否则一次瞬时空响应会让整期在写快照前终止。
 */
export function isRetryableEmptyResponse(choice) {
  return typeof choice?.message?.content !== "string" || !choice.message.content.trim();
}
