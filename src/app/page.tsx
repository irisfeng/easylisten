"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  TOPIC_GROUPS,
  categoryOf,
  listenMinutes,
  type CategoryId,
  type Piece,
} from "@/lib/content";
import {
  EVERGREEN_PIECES,
  ISSUE_PIECES,
  LATEST_NOTE,
  PIECES,
} from "@/lib/pieces";
import {
  hasSignal,
  loadPrefs,
  pickForYou,
  setInterests,
  type Prefs,
} from "@/lib/prefs";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/utils";

export default function Home() {
  const [active, setActive] = useState<CategoryId | "all">("all");
  // prefs 在客户端挂载后读取,避免与服务端渲染不一致
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  // "今日"标记依赖当前日期,放到挂载后再算,避免与预渲染的 HTML 不一致
  const [todayStr, setTodayStr] = useState("");
  useEffect(() => {
    setTodayStr(
      new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" }),
    );
  }, []);

  // 日刊按"期"分组(日期倒序);筛选后为空的期整组隐藏
  const issueGroups = useMemo(() => {
    const filtered =
      active === "all"
        ? ISSUE_PIECES
        : ISSUE_PIECES.filter((p) => p.category === active);
    const byDate = new Map<string, Piece[]>();
    for (const p of filtered) {
      const arr = byDate.get(p.publishedAt) ?? [];
      arr.push(p);
      byDate.set(p.publishedAt, arr);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [active]);

  const evergreen = useMemo(
    () =>
      active === "all"
        ? EVERGREEN_PIECES
        : EVERGREEN_PIECES.filter((p) => p.category === active),
    [active],
  );

  const forYou = useMemo(
    () => (prefs && hasSignal(prefs) ? pickForYou(PIECES, prefs, 3) : []),
    [prefs],
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
          每天从大量来源里替你挑出值得听的几篇。
        </p>
        {LATEST_NOTE && (
          <div className="mt-8 max-w-xl border-l-2 border-line pl-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink-faint">
              主编的话 · {LATEST_NOTE.date}
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
              {LATEST_NOTE.note}
            </p>
          </div>
        )}
      </header>

      {prefs && !prefs.onboarded && (
        <Onboarding
          onDone={(interests) => {
            setInterests(interests);
            setPrefs(loadPrefs());
          }}
        />
      )}

      {forYou.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-2 font-serif text-2xl tracking-tight">为你精选</h2>
          <p className="mb-4 text-sm text-ink-soft">
            根据你的兴趣与收听习惯排序,也会留一些惊喜。
          </p>
          <ul className="flex flex-col">
            {forYou.map((p, i) => (
              <PieceRow key={p.slug} piece={p} index={i} compact />
            ))}
          </ul>
        </section>
      )}

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

      {issueGroups.map(([date, list]) => (
        <section key={date} className="mb-12">
          <h2 className="border-b border-line pb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink-faint">
            {dateLabel(date, todayStr)}
          </h2>
          <ul className="flex flex-col">
            {list.map((p, i) => (
              <Reveal as="li" key={p.slug} index={i}>
                <PieceRow piece={p} index={i} />
              </Reveal>
            ))}
          </ul>
        </section>
      ))}

      {evergreen.length > 0 && (
        <section className="mb-12">
          <h2 className="border-b border-line pb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink-faint">
            长青 · 不过时的选文
          </h2>
          <ul className="flex flex-col">
            {evergreen.map((p, i) => (
              <Reveal as="li" key={p.slug} index={i}>
                <PieceRow piece={p} index={i} />
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-20 border-t border-line pt-8">
        <p className="font-serif text-lg italic leading-relaxed text-ink-soft">
          眼睛太忙了,把阅读交给耳朵。
        </p>
        <p className="mt-2 font-mono text-xs tracking-[0.08em] text-ink-faint">
          每天几篇 · 宁缺毋滥 · 轻听 EasyListen
        </p>
      </footer>
    </main>
  );
}

/** 期眉标:今日刊 · 7 月 18 日 · 周六;非当日只显示日期。 */
function dateLabel(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const week = "日一二三四五六"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base = `${m} 月 ${d} 日 · 周${week}`;
  return iso === today ? `今日刊 · ${base}` : base;
}

function PieceRow({
  piece,
  compact = false,
}: {
  piece: Piece;
  index: number;
  compact?: boolean;
}) {
  const cat = categoryOf(piece.category);
  return (
    <Link
      href={`/listen/${piece.slug}`}
      className={cn(
        "group block border-b border-line transition-colors hover:bg-black/[0.015]",
        compact ? "py-4" : "py-7",
      )}
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
        {piece.form === "long" && (
          <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-ink-soft">
            深读
          </span>
        )}
        {piece.en && (
          <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-ink-soft">
            EN
          </span>
        )}
        <span className="font-mono text-xs text-ink-faint">
          {listenMinutes(piece)} 分钟 · {piece.author}
        </span>
      </div>
      <h2
        className={cn(
          "font-serif leading-snug tracking-tight text-ink",
          compact ? "text-xl" : "text-2xl",
        )}
      >
        {piece.title}
      </h2>
      {!compact && (
        <p className="mt-1.5 line-clamp-2 text-[0.95rem] leading-relaxed text-ink-soft">
          {piece.intro}
        </p>
      )}
    </Link>
  );
}

function Onboarding({ onDone }: { onDone: (interests: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (t: string) =>
    setSelected((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  return (
    <section className="mb-12 rounded-xl border border-line bg-surface p-6">
      <h2 className="font-serif text-xl tracking-tight">你想多听点什么?</h2>
      <p className="mt-1 mb-4 text-sm text-ink-soft">
        选几个感兴趣的方向,首页会替你排好序。随时可以跳过,听着听着我们也会懂你。
      </p>
      <div className="space-y-3">
        {CATEGORIES.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "w-10 shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.08em]",
                c.deepClass,
              )}
            >
              {c.name}
            </span>
            {TOPIC_GROUPS[c.id].map((t) => (
              <button
                key={t}
                onClick={() => toggle(t)}
                aria-pressed={selected.includes(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  selected.includes(t)
                    ? "border-ink bg-ink text-surface"
                    : "border-line text-ink-soft hover:border-ink-faint hover:text-ink",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => onDone(selected)}
          disabled={selected.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm text-surface transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          开始聆听
        </button>
        <button
          onClick={() => onDone([])}
          className="rounded-md px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-black/[0.04] hover:text-ink"
        >
          先随便听听
        </button>
      </div>
    </section>
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
