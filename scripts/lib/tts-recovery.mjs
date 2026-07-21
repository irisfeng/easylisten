const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 对按音色调用的 TTS 做有限重试。空 Buffer 与抛错都视为失败；成功时返回
 * 实际音色，供上层保证整条音轨使用同一声音。
 */
export async function synthesizeWithRetries({
  voices,
  synthesizeAttempt,
  attemptsPerVoice = 3,
  baseDelayMs = 1200,
  wait = defaultWait,
}) {
  const failures = [];
  for (const voice of voices) {
    for (let attempt = 1; attempt <= attemptsPerVoice; attempt++) {
      try {
        const audio = await synthesizeAttempt(voice, attempt);
        if (!Buffer.isBuffer(audio) || audio.length === 0) {
          throw new Error("返回空音频");
        }
        return { audio, voice, attempt };
      } catch (error) {
        failures.push(`${voice}#${attempt}: ${error.message}`);
        if (attempt < attemptsPerVoice && baseDelayMs > 0) {
          await wait(baseDelayMs * attempt);
        }
      }
    }
  }
  throw new Error(`TTS 重试耗尽：${failures.join("；")}`);
}
