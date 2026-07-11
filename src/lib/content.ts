export type CategoryId = "science" | "news" | "essay" | "culture";

export interface Category {
  id: CategoryId;
  name: string;
  english: string;
  washClass: string;
  deepClass: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "science",
    name: "科学",
    english: "Science",
    washClass: "bg-sky-wash",
    deepClass: "text-sky-deep",
  },
  {
    id: "news",
    name: "新闻",
    english: "News",
    washClass: "bg-rose-wash",
    deepClass: "text-rose-deep",
  },
  {
    id: "essay",
    name: "深度",
    english: "Essays",
    washClass: "bg-moss-wash",
    deepClass: "text-moss-deep",
  },
  {
    id: "culture",
    name: "文化",
    english: "Culture",
    washClass: "bg-sand-wash",
    deepClass: "text-sand-deep",
  },
];

export function categoryOf(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}

export interface Piece {
  slug: string;
  title: string;
  category: CategoryId;
  author: string;
  publishedAt: string;
  intro: string;
  paragraphs: string[];
}

/** 按 260 字/分钟的朗读速度估算时长。 */
export function listenMinutes(piece: Piece): number {
  const chars = piece.paragraphs.join("").length + piece.intro.length;
  return Math.max(1, Math.round(chars / 260));
}
