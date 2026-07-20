"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Compass,
  Headphones,
  Pause,
  Play,
  UserCircle,
} from "@phosphor-icons/react";
import {
  CATEGORIES,
  TOPIC_GROUPS,
  categoryOf,
  listenMinutes,
  isPieceForAge,
  type AgeBand,
  type CategoryId,
  type Piece,
} from "@/lib/content";
import { editorialImageFor } from "@/lib/editorial-images";
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
import { cn } from "@/lib/utils";

type Playing = { slug: string; language: "zh" | "en" } | null;

const AGE_KEY = "easylisten.age-band.v1";
const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: "6-9", label: "6-9 岁" },
  { value: "10-12", label: "10-12 岁" },
  { value: "13-16", label: "13-16 岁" },
];

export default function Home() {
  const [active, setActive] = useState<CategoryId | "all">("all");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand>("13-16");
  const [signedIn, setSignedIn] = useState(false);
  const [playing, setPlaying] = useState<Playing>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const local = loadPrefs();
    setPrefs(local);
    const savedAge = window.localStorage.getItem(AGE_KEY);
    if (savedAge && AGE_BANDS.some((band) => band.value === savedAge)) {
      setAgeBand(savedAge as AgeBand);
    }
    // 公开资料读取对匿名访客返回空状态，不让“不登录也能听”产生报错噪音。
    void fetch("/api/account/profile", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (profile) => {
        if (!profile?.authenticated) return;
        setSignedIn(true);
        const syncModule = await import("@/lib/sync");
        const merged = await syncModule.syncAccountPrefs(local);
        if (merged) {
          savePrefs(merged);
          setPrefs(merged);
        }
        if (!profile?.ageBand) return;
        setAgeBand(profile.ageBand);
        window.localStorage.setItem(AGE_KEY, profile.ageBand);
      })
      .catch(() => {});

    return () => audioRef.current?.pause();
  }, []);

  const issueGroups = useMemo(() => {
    const byDate = new Map<string, Piece[]>();
    for (const piece of ISSUE_PIECES) {
      const current = byDate.get(piece.publishedAt) ?? [];
      current.push(piece);
      byDate.set(piece.publishedAt, current);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, []);

  const [latestIssue, ...earlierIssues] = issueGroups;
  const latestPieces = useMemo(
    () => (latestIssue?.[1] ?? []).filter((piece) => isPieceForAge(piece, ageBand)),
    [ageBand, latestIssue],
  );
  const alternate = latestPieces.find((piece) => piece.en);
  const filteredArchive = useMemo(() => {
    const pieces = [...earlierIssues.flatMap(([, list]) => list), ...EVERGREEN_PIECES]
      .filter((piece) => isPieceForAge(piece, ageBand));
    return active === "all"
      ? pieces
      : pieces.filter((piece) => piece.category === active);
  }, [active, ageBand, earlierIssues]);
  const forYou = useMemo(
    () => (prefs && hasSignal(prefs) ? pickForYou(PIECES, prefs, 3) : []),
    [prefs],
  );

  function chooseAge(value: AgeBand) {
    setAgeBand(value);
    window.localStorage.setItem(AGE_KEY, value);
    if (!signedIn) return;
    void fetch("/api/account/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ageBand: value }),
    }).catch(() => {});
  }

  function toggleAudio(piece: Piece, language: "zh" | "en" = "zh") {
    const same = playing?.slug === piece.slug && playing.language === language;
    if (same && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }

    audioRef.current?.pause();
    const folder = language === "en" ? `${piece.slug}-en` : piece.slug;
    const audio = new Audio(`/audio/${folder}/full.mp3`);
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlaying(null), { once: true });
    audio.addEventListener("error", () => setPlaying(null), { once: true });
    void audio.play().then(() => setPlaying({ slug: piece.slug, language })).catch(() => {
      setPlaying(null);
    });
  }

  if (!latestIssue) return null;

  return (
    <main className="mx-auto min-h-dvh max-w-[52rem] px-5 pb-24 sm:px-10 lg:px-12">
      <header className="pt-6 sm:pt-9">
        <div className="flex items-center justify-between gap-3">
          <label className="relative inline-flex min-h-11 items-center rounded-full border border-line bg-surface/60 pl-4 pr-10 text-sm text-ink">
            <span className="sr-only">选择主要收听年龄段</span>
            <select
              value={ageBand}
              onChange={(event) => chooseAge(event.target.value as AgeBand)}
              className="appearance-none bg-transparent pr-1 outline-none"
            >
              {AGE_BANDS.map((band) => (
                <option key={band.value} value={band.value}>{band.label}</option>
              ))}
            </select>
            <CaretDown aria-hidden size={15} className="pointer-events-none absolute right-4" />
          </label>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#sources" className="group inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft hover:text-ink">
              <span className="hidden min-[360px]:inline">本期选题与来源</span>
              <span className="min-[360px]:hidden">来源</span>
              <CaretRight aria-hidden size={16} className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <Link
              href="/account"
              aria-label={signedIn ? "进入我的轻听" : "家长登录"}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
            >
              <UserCircle aria-hidden size={21} weight={signedIn ? "fill" : "regular"} />
              <span className="hidden sm:inline">{signedIn ? "我的轻听" : "家长登录"}</span>
            </Link>
          </div>
        </div>

        <div className="pb-16 pt-20 sm:pb-20 sm:pt-24">
          <p className="font-mono text-[0.68rem] tracking-[0.26em] text-ink-soft">EASYLISTEN</p>
          <h1 className="mt-4 font-serif text-[3.35rem] leading-[0.98] tracking-[-0.055em] text-ink sm:text-[5.25rem]">
            轻听 · 少年刊
          </h1>
          <p className="mt-5 font-serif text-xl tracking-wide text-ink-soft sm:text-2xl">
            世界很大，不急着有标准答案
          </p>
          <p className="mt-10 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-ink-faint">
            {displayDate(latestIssue[0])}
          </p>
        </div>
      </header>

      <section aria-labelledby="latest-heading" className="border-t border-line pt-10 sm:pt-12">
        <div className="mb-7 flex items-end justify-between gap-4">
          <h2 id="latest-heading" className="font-serif text-xl tracking-wide sm:text-2xl">
            今天，编辑部为你选了 {latestPieces.length} 篇
          </h2>
          <p className="hidden shrink-0 text-xs text-ink-faint sm:block">
            约 {latestPieces.reduce((sum, piece) => sum + listenMinutes(piece), 0)} 分钟
          </p>
        </div>
        <p className="-mt-4 mb-5 text-xs text-ink-faint">
          当前节目单适合 {AGE_BANDS.find((band) => band.value === ageBand)?.label}，切换年龄会即时调整
        </p>

        <ol>
          {latestPieces.map((piece, index) => (
            <IssueRow
              key={piece.slug}
              piece={piece}
              index={index}
              playing={playing?.slug === piece.slug && playing.language === "zh"}
              onPlay={() => toggleAudio(piece)}
            />
          ))}
        </ol>
      </section>

      {alternate?.en && (
        <section className="mt-11 border-t border-line pt-8" aria-labelledby="alternate-heading">
          <div className="flex items-center gap-3">
            <Compass aria-hidden size={22} className="text-ink-soft" />
            <h2 id="alternate-heading" className="font-serif text-xl text-ink-soft">换个角度听</h2>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-7 grid grid-cols-[6.25rem_minmax(0,1fr)_3.5rem] items-center gap-4 sm:grid-cols-[9rem_minmax(0,1fr)_4rem] sm:gap-7">
            {editorialImageFor(alternate) && (
              <Link href={`/listen/${alternate.slug}`} className="relative aspect-square overflow-hidden bg-surface">
                <Image
                  src={editorialImageFor(alternate)!.src}
                  alt={editorialImageFor(alternate)!.alt}
                  fill
                  sizes="(max-width: 640px) 100px, 144px"
                  className="object-cover grayscale-[0.75] saturate-[0.7]"
                  style={{ objectPosition: editorialImageFor(alternate)!.position }}
                />
              </Link>
            )}
            <Link href={`/listen/${alternate.slug}`} className="min-w-0 group">
              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-accent">EN　真实语速 / 可看中文稿</p>
              <h3 className="mt-2 line-clamp-2 font-serif text-xl leading-tight tracking-tight group-hover:text-accent sm:text-2xl">
                {alternate.en.title}
              </h3>
              <p className="mt-2 hidden text-sm leading-6 text-ink-soft sm:line-clamp-1">{alternate.en.intro}</p>
              <p className="mt-2 text-xs text-ink-faint">{englishMinutes(alternate)} 分钟　{categoryOf(alternate.category).name}</p>
            </Link>
            <PlayButton
              label={`播放英文稿：${alternate.en.title}`}
              playing={playing?.slug === alternate.slug && playing.language === "en"}
              onClick={() => toggleAudio(alternate, "en")}
            />
          </div>
        </section>
      )}

      <section id="sources" className="mt-16 scroll-mt-6 border-t border-line pt-8" aria-labelledby="sources-heading">
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4">
            <span>
              <span id="sources-heading" className="block font-serif text-xl">本期选题与来源</span>
              <span className="mt-1 block text-xs text-ink-faint">每篇均标明发布者、原文标题与直达链接</span>
            </span>
            <CaretDown aria-hidden size={18} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-5 border-t border-line">
            {latestPieces.map((piece, index) => (
              <li key={piece.slug} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-line py-5">
                <span className="font-mono text-xs text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{piece.source?.name ?? "轻听编辑部"}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">{piece.source?.originalTitle ?? piece.title}</p>
                  {piece.source?.url && (
                    <a href={piece.source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-accent hover:underline">
                      查看原文 <CaretRight aria-hidden size={14} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {LATEST_NOTE && <p className="mt-5 text-sm leading-7 text-ink-soft">编辑手记：{LATEST_NOTE.note}</p>}
        </details>
      </section>

      {prefs && !prefs.onboarded && (
        <Onboarding onDone={(interests) => {
          setInterests(interests);
          setPrefs(loadPrefs());
        }} />
      )}

      {(forYou.length > 0 || filteredArchive.length > 0) && (
        <section className="mt-16 border-t border-line pt-8">
          <details>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between">
              <span className="font-serif text-xl">往期少年刊</span>
              <CaretDown aria-hidden size={18} />
            </summary>
            <div className="mt-5 flex gap-1 overflow-x-auto border-y border-line py-2">
              <FilterChip label="全部" activeState={active === "all"} onClick={() => setActive("all")} />
              {CATEGORIES.map((category) => (
                <FilterChip key={category.id} label={category.name} activeState={active === category.id} onClick={() => setActive(category.id)} />
              ))}
            </div>
            <ul>
              {filteredArchive.map((piece) => (
                <li key={piece.slug} className="border-b border-line py-5">
                  <Link href={`/listen/${piece.slug}`} className="group block">
                    <p className="text-xs text-ink-faint">{piece.publishedAt}　{categoryOf(piece.category).name}</p>
                    <h3 className="mt-1 font-serif text-xl leading-snug group-hover:text-accent">{piece.title}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <footer className="mt-20 border-t border-line pb-8 pt-9 text-center">
        <p className="font-serif text-base tracking-wide text-ink-soft">轻听，给你留一点思考的空间</p>
        <div className="mt-5 flex items-center justify-center gap-5 text-xs text-ink-faint">
          <Link href="/account" className="min-h-11 content-center hover:text-ink">家长账号，可选</Link>
          <span aria-hidden className="h-3 w-px bg-line" />
          <span>每天几篇，宁缺毋滥</span>
        </div>
      </footer>
    </main>
  );
}

function IssueRow({
  piece,
  index,
  playing,
  onPlay,
}: {
  piece: Piece;
  index: number;
  playing: boolean;
  onPlay: () => void;
}) {
  const image = editorialImageFor(piece);
  const compactImage = image && index > 0;
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_3.5rem] gap-3 border-b border-line py-7 sm:grid-cols-[3.25rem_minmax(0,1fr)_4rem] sm:gap-5 sm:py-8">
      <span className="pt-1 font-serif text-2xl text-ink-faint sm:text-3xl">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0 border-l-2 border-accent pl-4 sm:pl-6">
        {compactImage && (
          <Link href={`/listen/${piece.slug}`} className="mb-4 block w-28 overflow-hidden bg-surface sm:w-36">
            <figure>
              <div className="relative aspect-[4/3]">
                <Image src={image.src} alt={image.alt} fill sizes="(max-width: 640px) 112px, 144px" className="object-cover grayscale-[0.7] saturate-[0.65]" style={{ objectPosition: image.position }} />
              </div>
              <figcaption className="mt-1 text-[0.62rem] leading-4 text-ink-faint">编辑插图</figcaption>
            </figure>
          </Link>
        )}
        <Link href={`/listen/${piece.slug}`} className="group block">
          <h3 className="font-serif text-[1.42rem] leading-[1.2] tracking-[-0.02em] group-hover:text-accent sm:text-[1.72rem]">{piece.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft sm:text-[0.95rem]">{piece.intro}</p>
          <p className="mt-3 text-xs text-ink-faint">
            {listenMinutes(piece)} 分钟　<span className="text-accent">{categoryOf(piece.category).name}</span>
            {piece.en ? "　中英双语" : ""}
          </p>
        </Link>
      </div>
      <PlayButton label={`${playing ? "暂停" : "播放"}：${piece.title}`} playing={playing} onClick={onPlay} />
    </li>
  );
}

function PlayButton({ label, playing, onClick }: { label: string; playing: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="mt-0.5 flex size-12 shrink-0 items-center justify-center self-start rounded-full border border-ink-faint text-ink transition hover:border-accent hover:text-accent active:scale-95 sm:size-14">
      {playing ? <Pause aria-hidden size={18} weight="fill" /> : <Play aria-hidden size={18} weight="fill" className="translate-x-px" />}
    </button>
  );
}

function Onboarding({ onDone }: { onDone: (interests: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  function toggle(topic: string) {
    setSelected((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]);
  }
  return (
    <section className="mt-16 border-t border-line pt-9" aria-labelledby="interests-heading">
      <div className="flex items-center gap-3">
        <Headphones aria-hidden size={22} className="text-ink-soft" />
        <h2 id="interests-heading" className="font-serif text-xl">孩子更想听什么？</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-soft">选几个方向，只调整往期内容顺序。今天的少年刊仍由编辑部统一精选。</p>
      <div className="mt-6 space-y-5">
        {CATEGORIES.map((category) => (
          <div key={category.id} className="grid grid-cols-[3.5rem_1fr] gap-3">
            <span className="pt-2 text-xs text-accent">{category.name}</span>
            <div className="flex flex-wrap gap-2">
              {TOPIC_GROUPS[category.id].map((topic) => (
                <button key={topic} type="button" onClick={() => toggle(topic)} aria-pressed={selected.includes(topic)} className={cn("min-h-10 rounded-full border px-3 text-xs transition", selected.includes(topic) ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-accent hover:text-ink")}>{topic}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => onDone(selected)} disabled={selected.length === 0} className="min-h-11 rounded-full bg-ink px-5 text-sm text-paper disabled:opacity-35">保存兴趣</button>
        <button type="button" onClick={() => onDone([])} className="min-h-11 px-4 text-sm text-ink-soft hover:text-ink">暂时跳过</button>
      </div>
    </section>
  );
}

function FilterChip({ label, activeState, onClick }: { label: string; activeState: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={activeState} className={cn("min-h-10 shrink-0 px-3 text-xs transition", activeState ? "text-ink underline decoration-accent underline-offset-8" : "text-ink-soft hover:text-ink")}>{label}</button>;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${iso}　/　${weekday}`;
}

function englishMinutes(piece: Piece): number {
  if (!piece.en) return 0;
  const words = `${piece.en.intro} ${piece.en.paragraphs.join(" ")}`.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 145));
}
