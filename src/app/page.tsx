"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, categoryOf, listenMinutes, type CategoryId } from "@/lib/content";
import { PIECES } from "@/lib/pieces";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/utils";

export default function Home() {
  const [active, setActive] = useState<CategoryId | "all">("all");

  const pieces = useMemo(
    () => (active === "all" ? PIECES : PIECES.filter((p) => p.category === active)),
    [active],
  );

  return (
    <main className="mx-auto max-w-3xl px-6 pb-32">
      <header className="pt-20 pb-14">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          EasyListen
        </p>
        <h1 className="mt-3 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          轻听
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
          一个可以听的阅读空间。从科学到新闻,从深度长文到流行文化,
          挑一篇,让它读给你听。
        </p>
      </header>

      <nav className="sticky top-0 z-10 -mx-6 mb-10 border-b border-line bg-paper/85 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="全部"
            activeState={active === "all"}
            onClick={() => setActive("all")}
          />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              activeState={active === c.id}
              onClick={() => setActive(c.id)}
            />
          ))}
        </div>
      </nav>

      <ul className="flex flex-col">
        {pieces.map((p, i) => {
          const cat = categoryOf(p.category);
          return (
            <Reveal as="li" key={p.slug} index={i}>
              <Link
                href={`/listen/${p.slug}`}
                className="group block border-b border-line py-7 transition-colors hover:bg-black/[0.015]"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em]",
                      cat.washClass,
                      cat.deepClass,
                    )}
                  >
                    {cat.name}
                  </span>
                  <span className="font-mono text-xs text-ink-faint">
                    {listenMinutes(p)} 分钟 · {p.author}
                  </span>
                </div>
                <h2 className="font-serif text-2xl leading-snug tracking-tight text-ink">
                  {p.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[0.95rem] leading-relaxed text-ink-soft">
                  {p.intro}
                </p>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </main>
  );
}

function FilterChip({
  label,
  activeState,
  onClick,
}: {
  label: string;
  activeState: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activeState}
      className={cn(
        "rounded-md px-3.5 py-1.5 text-sm transition-colors",
        activeState
          ? "bg-ink text-surface"
          : "text-ink-soft hover:bg-black/[0.04] hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
