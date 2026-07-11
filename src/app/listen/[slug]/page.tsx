import { notFound } from "next/navigation";
import { PIECES, pieceBySlug } from "@/lib/pieces";
import Reader from "./Reader";

export function generateStaticParams() {
  return PIECES.map((p) => ({ slug: p.slug }));
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
