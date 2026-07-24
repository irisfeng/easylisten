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
