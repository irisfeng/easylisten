/**
 * 服务端读取音频 manifest，只把当前页面用得到的音轨信息传给浏览器。
 * manifest 记录了全部音轨的时间轴(几百 KB)，不能整份打进客户端包，所以
 * 这个文件只能被服务端组件引用。
 */
import manifest from "../../public/audio/manifest.json";
import type { Piece } from "./content";
import { listenMinutes } from "./content";
import { ISSUE_PIECES } from "./pieces";

const timings = (manifest as { timings?: Record<string, number[]> }).timings ?? {};

/** 音轨目录名 → 逐句起点时间轴；只包含这篇稿件实际存在的音轨。 */
export type Tracks = Record<string, number[]>;

export function tracksFor(piece: Piece): Tracks {
  const tracks: Tracks = {};
  for (const unit of [piece.slug, `${piece.slug}-m`, `${piece.slug}-en`]) {
    if (timings[unit]?.length > 1) tracks[unit] = timings[unit];
  }
  return tracks;
}

/** 同一期节目单里的一篇，供阅读页显示"接着听"和连续播放。 */
export interface QueueItem {
  slug: string;
  title: string;
  minutes: number;
  ageBands?: Piece["ageBands"];
  /** 可直接播放的中文音轨：女声 <slug>、男声 <slug>-m。 */
  units: string[];
}

export function issueQueueFor(piece: Piece): QueueItem[] {
  if (!ISSUE_PIECES.some((entry) => entry.slug === piece.slug)) return [];
  return ISSUE_PIECES.filter((entry) => entry.publishedAt === piece.publishedAt).map((entry) => ({
    slug: entry.slug,
    title: entry.title,
    minutes: listenMinutes(entry),
    ageBands: entry.ageBands,
    units: [entry.slug, `${entry.slug}-m`].filter((unit) => timings[unit]?.length > 1),
  }));
}
