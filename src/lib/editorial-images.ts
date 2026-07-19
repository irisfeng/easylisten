import type { Piece } from "./content";

export interface EditorialImage {
  src: string;
  alt: string;
  caption: string;
  position?: string;
}

/**
 * 轻听自己的编辑插图池。图片不从原站热链，也不暗示是新闻现场照片。
 * 新的一期只给少量重点稿件配图，维持少年刊的阅读节奏。
 */
const STORY_IMAGES: Record<string, EditorialImage> = {
  "2026-07-19-8": {
    src: "/editorial/2026-07-19/biomass-energy.webp",
    alt: "农田、秸秆压块与生物质能源设施组成的编辑插图",
    caption: "从一捆秸秆，到一度绿色电力",
    position: "center 54%",
  },
  "2026-07-19-mzl2if": {
    src: "/editorial/2026-07-19/ink-and-nature.webp",
    alt: "宣纸、毛笔、砚台与山水画组成的编辑插图",
    caption: "笔墨从古人来，生气从自然来",
    position: "center 48%",
  },
  "2026-07-19-drinking-water-with-meals-may-make-you-eat-more-": {
    src: "/editorial/2026-07-19/meal-and-water.webp",
    alt: "一份日常餐食与一杯水的编辑插图",
    caption: "一个习惯，也值得用实验重新看看",
    position: "center 52%",
  },
};

export function editorialImageFor(piece: Piece): EditorialImage | undefined {
  return piece.image ?? STORY_IMAGES[piece.slug];
}
