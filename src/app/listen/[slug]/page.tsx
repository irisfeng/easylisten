import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PIECES, pieceBySlug } from "@/lib/pieces";
import Reader from "./Reader";

export function generateStaticParams() {
  return PIECES.map((p) => ({ slug: p.slug }));
}

/** 每篇文章独立的分享元数据:微信等平台抓取链接卡片时用到。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const piece = pieceBySlug(slug);
  if (!piece) return {};
  return {
    title: `${piece.title} · 轻听`,
    description: piece.intro,
    openGraph: {
      title: piece.title,
      description: piece.intro,
      url: `https://easylisten.shddai.net/listen/${piece.slug}`,
      siteName: "轻听",
      locale: "zh_CN",
      type: "article",
    },
  };
}

export default async function ListenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const piece = pieceBySlug(slug);
  if (!piece) notFound();
  return <Reader piece={piece} />;
}
