/**
 * 客户端个性化:兴趣与收听行为存在 localStorage,排序在浏览器里完成。
 * 零后端、零账号——先验证"个性化排序是否真的提升完听率",再考虑上云。
 */

import type { CategoryId, Piece } from "./content";

const KEY = "easylisten.prefs.v1";

export interface Prefs {
  onboarded: boolean;
  /** 首次引导时勾选的兴趣标签。 */
  interests: string[];
  /** 各频道的行为亲和度(完听率的指数滑动平均,0~1)。 */
  affinity: Partial<Record<CategoryId, number>>;
  /** slug → 最高完听比例(0~1)。 */
  listened: Record<string, number>;
  favorites: string[];
  /** 手动选择的浏览器朗读音色(仅无预生成音频时使用)。 */
  voiceURI?: string;
}

const EMPTY: Prefs = {
  onboarded: false,
  interests: [],
  affinity: {},
  listened: {},
  favorites: [],
};

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等场景下静默降级为无记忆
  }
}

export function setInterests(interests: string[]) {
  savePrefs({ ...loadPrefs(), interests, onboarded: true });
}

export function setVoiceURI(voiceURI: string) {
  savePrefs({ ...loadPrefs(), voiceURI });
}

/** 记录一次收听:更新完听记录与频道亲和度。 */
export function recordListen(piece: Piece, ratio: number) {
  const prefs = loadPrefs();
  const clamped = Math.min(1, Math.max(0, ratio));
  const prev = prefs.listened[piece.slug] ?? 0;
  prefs.listened[piece.slug] = Math.max(prev, clamped);
  const old = prefs.affinity[piece.category] ?? 0.5;
  prefs.affinity[piece.category] = old * 0.8 + clamped * 0.2;
  savePrefs(prefs);
}

export function toggleFavorite(slug: string): boolean {
  const prefs = loadPrefs();
  const on = prefs.favorites.includes(slug);
  prefs.favorites = on
    ? prefs.favorites.filter((s) => s !== slug)
    : [...prefs.favorites, slug];
  savePrefs(prefs);
  return !on;
}

/** 是否已有足够信号做个性化(勾过兴趣,或听完过至少一篇)。 */
export function hasSignal(prefs: Prefs): boolean {
  return (
    prefs.interests.length > 0 ||
    Object.values(prefs.listened).some((r) => r > 0.6)
  );
}

/**
 * 个性化打分:兴趣标签命中 + 频道行为亲和 + 新鲜度,听过的靠后。
 * 候选池本身已是编辑精选,这里只做排序和配比,不做召回。
 */
export function scorePiece(piece: Piece, prefs: Prefs): number {
  let score = 0;
  const topicHits = (piece.topics ?? []).filter((t) =>
    prefs.interests.includes(t),
  ).length;
  score += topicHits * 2;
  score += (prefs.affinity[piece.category] ?? 0.5) * 1.5;
  const ageDays =
    (Date.now() - Date.parse(piece.publishedAt)) / (24 * 3600 * 1000);
  if (ageDays < 2) score += 1;
  if ((prefs.listened[piece.slug] ?? 0) > 0.8) score -= 10;
  return score;
}

/** "为你精选":个性化排序取前 n 篇。 */
export function pickForYou(pieces: Piece[], prefs: Prefs, n: number): Piece[] {
  return [...pieces]
    .map((p) => ({ p, s: scorePiece(p, prefs) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ p }) => p);
}
