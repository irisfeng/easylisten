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
  savePrefs,
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
    const local = loadPrefs();
    setPrefs(local);
    // 已登录时合并本机与账号记录；未登录保持纯本地使用
    void import("@/lib/sync").then((m) =>
      m
        .syncAccountPrefs(local)
        .then((merged) => {
          if (merged) {
            savePrefs(merged);
            setPrefs(merged);
          }
        }),
    );
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

  // 首屏优先展示最新一期，让新音色和新功能先被体验；个性化精选随后展示。
  const [latestIssue, ...earlierIssueGroups] = issueGroups;
  const latestMinutes = latestIssue?.[1].reduce(
    (total, piece) => total + listenMinutes(piece),
    0,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 pb-32">
      <header className="pt-5 pb-10 sm:pt-8 sm:pb-12">
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line">
          <Link href="/" className="flex items-baseline gap-2 text-ink">
            <span className="font-serif text-xl tracking-tight">轻听</span>
            <span className="text-xs text-ink-faint">EasyListen</span>
          </Link>
          <Link
            href="/account"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink-soft transition hover:border-accent hover:text-ink active:scale-[0.98]"
          >
            家长账号 · 可选
          </Link>
        </div>
        <div className="grid gap-8 pt-10 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-end sm:pt-14">
          <div>
            <h1 className="max-w-2xl font-serif text-[2.75rem] leading-[1.08] tracking-[-0.035em] sm:text-5xl">
              <span className="block">接送路上，给孩子</span>
              <span className="block">听见更大的世界</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-ink-soft sm:text-lg">
              每天替你挑好几篇。中英双语，新闻、科学、人文都讲得明白。
            </p>
          </div>
          {latestIssue && (
            <aside className="rounded-2xl border border-line bg-surface p-5 shadow-[0_16px_44px_rgba(27,48,38,0.06)]" aria-label="今日收听概览">
              <p className="text-sm text-ink-soft">今天已经替你选好</p>
              <p className="mt-2 font-serif text-4xl tracking-tight text-ink">
                {latestIssue[1].length} <span className="text-lg text-ink-soft">篇</span>
              </p>
              <p className="mt-1 text-sm text-ink-soft">约 {latestMinutes} 分钟，适合一段接送路程</p>
            </aside>
          )}
        </div>
      </header>

      {LATEST_NOTE && (
        <aside className="mb-10 rounded-2xl bg-surface-strong px-5 py-5 sm:px-6" aria-label="主编的话">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg tracking-tight">主编的话</h2>
            <time className="text-xs text-ink-faint">{LATEST_NOTE.date}</time>
          </div>
          <p className="mt-2 text-[0.95rem] leading-7 text-ink-soft">{LATEST_NOTE.note}</p>
        </aside>
      )}

      {prefs && !prefs.onboarded && (
        <Onboarding
          onDone={(interests) => {
            setInterests(interests);
            setPrefs(loadPrefs());
          }}
        />
      )}

      <nav aria-label="按内容领域筛选" className="sticky top-0 z-10 -mx-6 mb-10 border-y border-line bg-paper/90 px-6 py-2 backdrop-blur-xl">
        <div className="hide-scrollbar flex gap-1 overflow-x-auto overscroll-x-contain">
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

      {latestIssue && (
        <IssueSection
          date={latestIssue[0]}
          list={latestIssue[1]}
          today={todayStr}
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

      {earlierIssueGroups.map(([date, list]) => (
        <IssueSection key={date} date={date} list={list} today={todayStr} />
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
          眼睛太忙了，把阅读交给耳朵。
        </p>
        <p className="mt-2 text-xs text-ink-faint">每天几篇。宁缺毋滥。</p>
        <p className="mt-1 text-xs text-ink-faint">轻听 EasyListen</p>
      </footer>
    </main>
  );
}

function IssueSection({
  date,
  list,
  today,
}: {
  date: string;
  list: Piece[];
  today: string;
}) {
  return (
    <section className="mb-12">
      <h2 className="border-b border-line pb-3 text-sm font-medium text-ink-soft">
        {dateLabel(date, today)}
      </h2>
      <ul className="flex flex-col">
        {list.map((p, i) => (
          <Reveal as="li" key={p.slug} index={i}>
            <PieceRow piece={p} index={i} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/** 期眉标：今日刊 · 7 月 18 日 周六；非当日只显示日期。 */
function dateLabel(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const week = "日一二三四五六"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base = `${m} 月 ${d} 日 周${week}`;
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
        "group -mx-3 block rounded-2xl border-b border-line px-3 transition hover:bg-surface active:scale-[0.995]",
        compact ? "py-4" : "py-6 sm:py-7",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            cat.washClass,
            cat.deepClass,
          )}
        >
          {cat.name}
        </span>
        {piece.form === "long" && (
          <span className="text-xs text-ink-soft">
            深读
          </span>
        )}
        {piece.en && (
          <span className="text-xs text-ink-soft">
            中英双语
          </span>
        )}
        <span className="text-xs text-ink-faint">
          {listenMinutes(piece)} 分钟
        </span>
      </div>
      <h2
        className={cn(
          "font-serif leading-snug tracking-tight text-ink",
          compact ? "text-xl" : "text-[1.45rem] sm:text-[1.65rem]",
        )}
      >
        {piece.title}
      </h2>
      {!compact && (
        <p className="mt-1.5 line-clamp-2 text-[0.95rem] leading-relaxed text-ink-soft">
          {piece.intro}
        </p>
      )}
      {piece.source && (
        <p className="mt-2 text-xs font-medium text-accent">
          来源：{piece.source.name}{piece.source.basis === "full-text" ? "，原文可查" : ""}
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
    <section className="mb-12 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-2xl tracking-tight">孩子更想听什么？</h2>
      <p className="mt-1 mb-4 text-sm text-ink-soft">
        选几个方向，首页会替你排好顺序。不确定也可以先随便听听。
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
                  "min-h-11 rounded-full border px-3 text-sm transition-colors active:scale-[0.98]",
                  selected.includes(t)
                    ? "border-ink bg-ink text-surface"
                    : "border-line text-ink-soft hover:border-accent hover:text-ink",
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
          className="min-h-11 rounded-full bg-ink px-5 text-sm text-surface transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          开始聆听
        </button>
        <button
          onClick={() => onDone([])}
          className="min-h-11 rounded-full px-4 text-sm text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink active:scale-[0.98]"
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
        "min-h-11 shrink-0 rounded-full px-4 text-sm transition-colors active:scale-[0.98]",
        activeState
          ? "bg-ink text-surface"
          : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
