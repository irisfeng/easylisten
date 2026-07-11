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
  /** 细分兴趣标签,用于个性化排序。 */
  topics?: string[];
  /** 听稿的原文出处(管线产出的内容都有)。 */
  source?: { name: string; url: string; originalTitle?: string };
}

/** 兴趣标签全集。首次进入时供用户勾选,也约束管线的 topics 输出。 */
export const TOPICS = [
  "航天与宇宙",
  "脑与认知",
  "气候与能源",
  "AI 与技术",
  "城市与生活",
  "交通与出行",
  "阅读与写作",
  "思维方法",
  "音乐",
  "历史与艺术",
  "科学史",
  "社会观察",
] as const;

/** 按 260 字/分钟的朗读速度估算时长。 */
export function listenMinutes(piece: Piece): number {
  const chars = piece.paragraphs.join("").length + piece.intro.length;
  return Math.max(1, Math.round(chars / 260));
}
