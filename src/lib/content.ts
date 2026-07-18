/**
 * 内容体系的三个正交维度:领域(讲什么)× 形态(怎么听)× 时效(何时听)。
 * 设计依据见 docs/content-architecture.md。
 */

export type CategoryId =
  | "science"
  | "tech"
  | "society"
  | "humanities"
  | "living"
  | "culture";

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
    id: "tech",
    name: "技术",
    english: "Technology",
    washClass: "bg-violet-wash",
    deepClass: "text-violet-deep",
  },
  {
    id: "society",
    name: "社会",
    english: "Society",
    washClass: "bg-rose-wash",
    deepClass: "text-rose-deep",
  },
  {
    id: "humanities",
    name: "人文",
    english: "Humanities",
    washClass: "bg-sand-wash",
    deepClass: "text-sand-deep",
  },
  {
    id: "living",
    name: "生活",
    english: "Living",
    washClass: "bg-moss-wash",
    deepClass: "text-moss-deep",
  },
  {
    id: "culture",
    name: "文化",
    english: "Culture",
    washClass: "bg-teal-wash",
    deepClass: "text-teal-deep",
  },
];

export function categoryOf(id: CategoryId): Category {
  // 内容 JSON 由管线产出,理论上总是合法;万一出现未知领域,退回第一个
  // 领域渲染而不是让页面崩溃
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/** 形态:简报(1-2 分钟快讯)/ 精选(3-6 分钟日刊主体)/ 长听(10 分钟+)。 */
export type Form = "brief" | "pick" | "long";

/** 时效:热点(48h 降权)/ 本周 / 长青(可反复分发的资产)。 */
export type Shelf = "hot" | "fresh" | "evergreen";

export interface Piece {
  slug: string;
  title: string;
  category: CategoryId;
  author: string;
  publishedAt: string;
  intro: string;
  paragraphs: string[];
  /** 细分兴趣标签,用于个性化排序。可跨领域。 */
  topics?: string[];
  /** 形态,默认 pick。 */
  form?: Form;
  /** 时效,默认 fresh。 */
  shelf?: Shelf;
  /** 听稿的原文出处(管线产出的内容都有)。 */
  source?: { name: string; url: string; originalTitle?: string };
  /** 双语实验:英文转述稿(每日最高分一篇携带),音频在 <slug>-en/。 */
  en?: { title: string; intro: string; paragraphs: string[] };
}

/** 话题全集,按领域分组。服务兴趣勾选、管线打标与个性化匹配。 */
export const TOPIC_GROUPS: Record<CategoryId, string[]> = {
  science: ["航天与宇宙", "生命与演化", "物质与数学", "脑与认知"],
  tech: ["AI 与计算", "工程与制造", "互联网产品", "数字生活"],
  society: ["全球时事", "经济与商业", "城市与公共", "气候与能源"],
  humanities: ["历史", "哲学与思想", "艺术与设计", "阅读与写作"],
  living: ["健康与医学", "心理与情绪", "食物与日常", "出行与旅行"],
  culture: ["音乐", "影视与游戏", "流行与网络文化", "体育"],
};

export const TOPICS: string[] = Object.values(TOPIC_GROUPS).flat();

/** 按 260 字/分钟的朗读速度估算时长。 */
export function listenMinutes(piece: Piece): number {
  const chars = piece.paragraphs.join("").length + piece.intro.length;
  return Math.max(1, Math.round(chars / 260));
}
