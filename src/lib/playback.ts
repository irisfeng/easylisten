/**
 * 本机的播放习惯：语速、是否连续播放、每篇听到第几句。这些只对当前设备
 * 有意义，单独存 localStorage，不进入账号同步的 Prefs。
 */

import type { AgeBand } from "./content";

const KEY = "easylisten.playback.v1";
const AGE_KEY = "easylisten.age-band.v1";
const MAX_POSITIONS = 40;

export interface Playback {
  rate: number;
  /** 一篇听完后自动播放当期节目单的下一篇。 */
  autoContinue: boolean;
  /** slug → 中文稿听到的句子下标；听完即清除。 */
  positions: Record<string, number>;
}

function defaults(): Playback {
  return { rate: 1, autoContinue: true, positions: {} };
}

export function loadPlayback(): Playback {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

function save(playback: Playback) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(playback));
  } catch {
    // 隐私模式等场景下静默降级为无记忆
  }
}

export function saveRate(rate: number) {
  save({ ...loadPlayback(), rate });
}

export function saveAutoContinue(autoContinue: boolean) {
  save({ ...loadPlayback(), autoContinue });
}

/** index 为 null 表示已听完，不再需要续听位置。 */
export function savePosition(slug: string, index: number | null) {
  const playback = loadPlayback();
  const positions = { ...playback.positions };
  delete positions[slug];
  if (index !== null && index > 0) positions[slug] = index;
  // 对象按插入顺序遍历，超出上限时丢掉最早的记录
  const kept = Object.entries(positions).slice(-MAX_POSITIONS);
  save({ ...playback, positions: Object.fromEntries(kept) });
}

export function loadAgeBand(): AgeBand | null {
  try {
    const value = window.localStorage.getItem(AGE_KEY);
    return value === "6-9" || value === "10-12" || value === "13-16" ? value : null;
  } catch {
    return null;
  }
}

export function saveAgeBand(ageBand: AgeBand) {
  try {
    window.localStorage.setItem(AGE_KEY, ageBand);
  } catch {
    // 同上
  }
}
