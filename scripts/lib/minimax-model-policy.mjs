export const DEFAULT_MINIMAX_TTS_MODEL = "speech-2.8-turbo";
export const MINIMAX_TTS_FALLBACK_MODELS = ["speech-2.6-turbo", "speech-02-turbo"];

export const MINIMAX_TTS_PRICE_CNY_PER_10K = Object.freeze({
  turbo: 2,
  hd: 3.5,
});

export function miniMaxTtsModelCandidates(configuredModel = "") {
  const primary = configuredModel.trim() || DEFAULT_MINIMAX_TTS_MODEL;
  if (!/-turbo$/i.test(primary)) {
    throw new Error(
      `MiniMax 正式音频只允许 Turbo 模型，收到 ${primary}；HD 成本高 75%，已拒绝付费调用`,
    );
  }
  return [...new Set([primary, ...MINIMAX_TTS_FALLBACK_MODELS])];
}

export function estimateMiniMaxTtsCostCny(chars, model = DEFAULT_MINIMAX_TTS_MODEL) {
  const tier = /-hd$/i.test(model) ? "hd" : "turbo";
  return (Math.max(0, Number(chars) || 0) / 10_000) * MINIMAX_TTS_PRICE_CNY_PER_10K[tier];
}
