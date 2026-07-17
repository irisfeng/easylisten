import type { Piece } from "./content";
import daily from "../../content/daily.json";
import seeds from "../../content/seeds.json";
import editorialJson from "../../content/editorial.json";

/**
 * 内容统一存于 content/ 下的 JSON:
 * - daily.json:管线每日产出的听稿(GitHub Actions 追加)
 * - seeds.json:手写的长青选文
 * - editorial.json:每期的"主编的话"(管线随日刊生成)
 */
export const PIECES: Piece[] = [...daily, ...seeds] as Piece[];

export interface EditorialNote {
  date: string;
  note: string;
}

export const EDITORIAL: EditorialNote[] = editorialJson as EditorialNote[];

/** 最新一期的主编的话(没有出刊过则为空)。 */
export const LATEST_NOTE: EditorialNote | undefined = EDITORIAL[0];

export function pieceBySlug(slug: string): Piece | undefined {
  return PIECES.find((p) => p.slug === slug);
}
