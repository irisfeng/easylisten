const DEFAULT_ATTEMPTS = 4;
const DEFAULT_DELAYS_MS = [60_000, 180_000, 600_000];

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDelays(value) {
  if (!value) return DEFAULT_DELAYS_MS;
  const parsed = String(value)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((delay) => Number.isFinite(delay) && delay >= 0);
  return parsed.length ? parsed : DEFAULT_DELAYS_MS;
}

export function resolveProcessRetryPlan(env = process.env) {
  const attempts = Math.min(
    8,
    positiveInteger(env.SYNTHESIS_PROCESS_ATTEMPTS, DEFAULT_ATTEMPTS),
  );
  const configuredDelays = parseDelays(env.SYNTHESIS_PROCESS_RETRY_DELAYS_MS);
  const delaysMs = Array.from({ length: Math.max(0, attempts - 1) }, (_, index) =>
    configuredDelays[Math.min(index, configuredDelays.length - 1)],
  );
  return { attempts, delaysMs };
}
