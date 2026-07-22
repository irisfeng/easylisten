import { normalizeForSpeech, splitSentences } from "../../src/lib/speech-text.js";
import { audioPlanForPiece } from "./audio-policy.mjs";

// MiniMax 当前计费口径：1 个汉字按 2 个字符，其余字符按 1 个字符。
export function miniMaxBillingChars(text) {
  return Array.from(text).reduce(
    (total, char) => total + (/\p{Script=Han}/u.test(char) ? 2 : 1),
    0,
  );
}

export function miniMaxCharsForTrack(track) {
  if (track.engine !== "minimax") return 0;
  return splitSentences(track.paragraphs).reduce((total, sentence) => {
    const text = normalizeForSpeech(sentence, track.language === "en" ? "en" : "zh");
    return total + (/\p{L}|\p{N}/u.test(text) ? miniMaxBillingChars(text) : 0);
  }, 0);
}

export function miniMaxCharsForTracks(tracks) {
  return tracks.reduce((total, track) => total + miniMaxCharsForTrack(track), 0);
}

export function miniMaxCharsForPiece(piece) {
  return miniMaxCharsForTracks(audioPlanForPiece(piece));
}

/**
 * 节目单最多只有 6 篇，枚举全部子集比贪心更可靠：先保留最多篇数，再保留
 * 总评分最高的组合，同时守住地域均衡、双语下限与 MiniMax 硬预算。
 */
export function fitIssueEntriesToMiniMaxBudget(
  entries,
  {
    maxChars = 12_000,
    minPicks = 2,
    minBilingual = 1,
    initialRegionCounts = { mainland: 0, international: 0 },
    initialBilingual = 0,
  } = {},
) {
  let best = null;
  const count = entries.length;

  for (let mask = 1; mask < 2 ** count; mask++) {
    const selected = entries.filter((_, index) => mask & (1 << index));
    if (selected.length < minPicks) continue;

    const chars = selected.reduce(
      (total, entry) => total + miniMaxCharsForPiece(entry.piece),
      0,
    );
    if (chars > maxChars) continue;

    const regions = selected.reduce(
      (totals, entry) => {
        const region = entry.piece.source?.region === "mainland" ? "mainland" : "international";
        totals[region] += 1;
        return totals;
      },
      {
        mainland: Math.max(0, Number(initialRegionCounts.mainland) || 0),
        international: Math.max(0, Number(initialRegionCounts.international) || 0),
      },
    );
    if (Math.abs(regions.mainland - regions.international) > 1) continue;

    const bilingual =
      Math.max(0, Number(initialBilingual) || 0) +
      selected.filter((entry) => entry.piece.en).length;
    if (bilingual < minBilingual) continue;

    const score = selected.reduce((total, entry) => total + (Number(entry.score) || 0), 0);
    const candidate = { selected, chars, score };
    if (
      !best ||
      candidate.selected.length > best.selected.length ||
      (candidate.selected.length === best.selected.length && candidate.score > best.score) ||
      (candidate.selected.length === best.selected.length &&
        candidate.score === best.score &&
        candidate.chars < best.chars)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    throw new Error(
      `音频预算内无法保留至少 ${minPicks} 篇、地域均衡且含 ${minBilingual} 篇双语稿的节目单`,
    );
  }
  return best.selected;
}
