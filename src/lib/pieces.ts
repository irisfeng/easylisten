import type { Piece } from "./content";
import daily from "../../content/daily.json";
import seeds from "../../content/seeds.json";

/**
 * 内容统一存于 content/ 下的 JSON:
 * - daily.json:管线每日产出的听稿(GitHub Actions 追加)
 * - seeds.json:手写的长青选文
 */
export const PIECES: Piece[] = [...daily, ...seeds] as Piece[];

export function pieceBySlug(slug: string): Piece | undefined {
  return PIECES.find((p) => p.slug === slug);
}
