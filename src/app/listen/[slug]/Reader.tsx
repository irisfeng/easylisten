"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Piece } from "@/lib/content";
import { categoryOf, listenMinutes } from "@/lib/content";
import { track } from "@vercel/analytics";
import {
  loadPrefs,
  recordListen,
  setVoiceGender,
  setVoiceURI,
  toggleFavorite,
} from "@/lib/prefs";
import {
  createSpeechEngine,
  listVoices,
  splitSentences,
  type SpeechEngine,
} from "@/lib/tts";
import { cn } from "@/lib/utils";
import { SharePanel } from "./Share";
import audioManifest from "../../../../public/audio/manifest.json";
import {
  ArrowLeft,
  ArrowSquareOut,
  Heart as HeartIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  ShareNetwork,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
} from "@phosphor-icons/react";

const RATES = [0.8, 1, 1.25, 1.5];

type PlayState = "idle" | "playing" | "paused";

export default function Reader({ piece }: { piece: Piece }) {
  const cat = categoryOf(piece.category);

  // 双语实验:携带英文稿的篇目可切换中/英,音频走 <slug>-en
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const script = lang === "en" && piece.en ? piece.en : piece;

  // 把每段切成句子,并给每句分配一个全篇唯一的下标,
  // 这样朗读进度和文中高亮能对上号。
  const { paragraphs, sentences } = useMemo(() => {
    let counter = 0;
    const paras = script.paragraphs.map((p) => {
      const parts = splitSentences([p]);
      return parts.map((text) => ({ text, index: counter++ }));
    });
    return { paragraphs: paras, sentences: splitSentences(script.paragraphs) };
  }, [script]);

  const engineRef = useRef<SpeechEngine | null>(null);
  const [available, setAvailable] = useState(true);
  const [state, setState] = useState<PlayState>("idle");
  const [current, setCurrent] = useState(-1);
  const [rate, setRate] = useState(1);
  const [favorite, setFavorite] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // 双声篇目(有 -m 变体)可切男/女声,偏好记在本地
  const [gender, setGender] = useState<"f" | "m">("f");
  useEffect(() => {
    setGender(loadPrefs().voiceGender ?? "f");
  }, []);
  // 双语实验的唯一切换是中/英；中文固定 MiniMax 女声，不展示男女声开关。
  const hasMale =
    !piece.en && (audioManifest.slugs as string[]).includes(`${piece.slug}-m`);

  const audioSlug =
    lang === "en"
      ? `${piece.slug}-en`
      : gender === "m" && hasMale
        ? `${piece.slug}-m`
        : piece.slug;
  const hasAudio = (audioManifest.slugs as string[]).includes(audioSlug);
  const timings = (
    audioManifest as { timings?: Record<string, number[]> }
  ).timings?.[audioSlug];

  // 完听率是个性化排序的核心信号:记录本次会话听到的最远句子。
  const maxHeardRef = useRef(-1);
  useEffect(() => {
    if (current > maxHeardRef.current) maxHeardRef.current = current;
  }, [current]);

  // 当前句越过可视阅读区时自动跟随。底部为固定播放器留出空间，避免
  // “高亮其实在动，但一直藏在播放器下面”。用户手动点可见句子不会跳屏。
  useEffect(() => {
    if (current < 0 || state !== "playing") return;
    const active = document.querySelector<HTMLElement>(
      `[data-sentence-index="${current}"]`,
    );
    if (!active) return;

    const rect = active.getBoundingClientRect();
    const topGuard = 72;
    const bottomGuard = window.innerHeight - 128;
    if (rect.top >= topGuard && rect.bottom <= bottomGuard) return;

    active.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [current, state]);

  // 浏览器语音列表异步加载;仅在走 WebSpeech 兜底时展示音色切换。
  useEffect(() => {
    if (hasAudio || typeof window === "undefined" || !("speechSynthesis" in window))
      return;
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, [hasAudio]);

  // 已记录到的最远句子;只有超过它才再次记录,防止 pagehide/卸载重复回灌亲和度
  const lastRecordedRef = useRef(-1);

  useEffect(() => {
    // 切换文章时清零播放状态,避免复用组件把上一篇的进度记到新文章上
    maxHeardRef.current = -1;
    lastRecordedRef.current = -1;
    setCurrent(-1);
    setState("idle");
    setFavorite(loadPrefs().favorites.includes(piece.slug));
    const engine = createSpeechEngine({
      slug: audioSlug,
      hasAudio,
      timings,
      voiceURI: loadPrefs().voiceURI,
    });
    engineRef.current = engine;
    setAvailable(engine.isAvailable());
    engine.onSentence((i) => setCurrent(i));

    // 手机上切后台/杀标签页不会触发组件卸载,进度必须在这些时刻落盘
    const flush = () => {
      if (maxHeardRef.current > lastRecordedRef.current) {
        lastRecordedRef.current = maxHeardRef.current;
        recordListen(piece, (maxHeardRef.current + 1) / sentences.length);
      }
    };
    engine.onDone(() => {
      maxHeardRef.current = sentences.length - 1;
      setState("idle");
      setCurrent(-1);
      flush();
      // 完听事件:与 listen_start 相除即得每篇完听率
      track("listen_done", { slug: piece.slug });
    });
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      engine.stop();
      flush();
    };
  }, [piece, audioSlug, sentences.length, hasAudio, timings]);

  // 每篇每次访问只报一次"开始听",作完听率的分母
  const startTrackedRef = useRef(false);

  const startFrom = (i: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!startTrackedRef.current) {
      startTrackedRef.current = true;
      track("listen_start", { slug: piece.slug });
    }
    engine.speak(sentences, i);
    setState("playing");
  };

  const toggle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state === "playing") {
      engine.pause();
      setState("paused");
    } else if (state === "paused") {
      engine.resume();
      setState("playing");
    } else {
      startFrom(current >= 0 ? current : 0);
    }
  };

  const skip = (delta: number) => {
    const next = Math.min(
      sentences.length - 1,
      Math.max(0, (current < 0 ? 0 : current) + delta),
    );
    startFrom(next);
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    engineRef.current?.setRate(next);
  };

  // 空格键播放/暂停,方向键跳句。监听器只装一次,经 ref 调到最新的处理函数。
  const toggleRef = useRef(toggle);
  const skipRef = useRef(skip);
  toggleRef.current = toggle;
  skipRef.current = skip;

  // Media Session:锁屏/控制中心显示曲目信息并接管播放控制
  // (系统的播放/暂停、上一曲/下一曲映射到播放器的暂停与跳句)。
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: piece.title,
      artist: "轻听 EasyListen",
      album: cat.name,
      artwork: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    ms.setActionHandler("play", () => toggleRef.current());
    ms.setActionHandler("pause", () => toggleRef.current());
    ms.setActionHandler("previoustrack", () => skipRef.current(-1));
    ms.setActionHandler("nexttrack", () => skipRef.current(1));
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, [piece, cat.name]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      state === "playing" ? "playing" : state === "paused" ? "paused" : "none";
  }, [state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggleRef.current();
      } else if (e.code === "ArrowRight") {
        skipRef.current(1);
      } else if (e.code === "ArrowLeft") {
        skipRef.current(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress =
    sentences.length > 0 && current >= 0
      ? ((current + 1) / sentences.length) * 100
      : 0;

  return (
    <main className="mx-auto max-w-2xl px-6 pb-40">
      <div className="pt-5 sm:pt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-full pr-4 text-sm text-ink-soft transition-colors hover:text-ink active:scale-[0.98]"
        >
          <ArrowLeft size={18} weight="regular" aria-hidden="true" />
          返回首页
        </Link>
      </div>

      <article className="pt-6 sm:pt-8">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              cat.washClass,
              cat.deepClass,
            )}
          >
            {cat.name}
          </span>
          <span className="text-xs text-ink-faint">{listenMinutes(piece)} 分钟</span>
          <span className="text-xs text-ink-faint">{piece.author}</span>
          <time className="text-xs text-ink-faint">{piece.publishedAt}</time>
          {hasMale && lang === "zh" && (
            <button
              onClick={() => {
                const g = gender === "f" ? "m" : "f";
                setGender(g);
                setVoiceGender(g);
              }}
              aria-pressed={gender === "m"}
              className="ml-auto min-h-10 rounded-full border border-line px-3 text-xs text-ink-soft transition-colors hover:border-accent hover:text-ink active:scale-[0.98]"
            >
              {gender === "f" ? "女声" : "男声"}
            </button>
          )}
          {piece.en && (
            <button
              onClick={() => {
                const next = lang === "zh" ? "en" : "zh";
                setLang(next);
                if (next === "en") track("listen_en", { slug: piece.slug });
              }}
              aria-pressed={lang === "en"}
              className={cn(
                !(hasMale && lang === "zh") && "ml-auto",
                "min-h-10 rounded-full border border-line px-3 text-xs text-ink-soft transition-colors hover:border-accent hover:text-ink active:scale-[0.98]",
              )}
            >
              {lang === "zh" ? "EN" : "中"}
            </button>
          )}
        </div>

        <h1 className="font-serif text-[2.35rem] leading-[1.14] tracking-[-0.03em] sm:text-5xl">
          {script.title}
        </h1>

        {piece.source && (
          <SourceCard source={piece.source} />
        )}

        <p className="mt-7 border-l-2 border-accent/40 pl-4 font-serif text-xl leading-relaxed text-ink-soft">
          {script.intro}
        </p>

        <div className="mt-9 space-y-6 text-[1.075rem] leading-[1.9] text-ink">
          {paragraphs.map((para, pi) => (
            <p key={pi}>
              {para.map((s) => (
                <button
                  type="button"
                  key={s.index}
                  data-index={s.index}
                  data-sentence-index={s.index}
                  onClick={() => startFrom(s.index)}
                  className={cn(
                    "sentence",
                    current === s.index && "sentence-active",
                  )}
                >
                  {s.text}
                </button>
              ))}
            </p>
          ))}
        </div>

        {piece.source && (
          <p className="mt-10 border-t border-line pt-4 font-mono text-xs leading-relaxed text-ink-faint">
            本文由轻听编辑部基于上方原文独立转述，不是原文翻译；事实以原始来源为准。
          </p>
        )}
      </article>

      <PlayerBar
        available={available}
        state={state}
        rate={rate}
        progress={progress}
        favorite={favorite}
        voices={voices}
        onToggle={toggle}
        onSkip={skip}
        onRate={cycleRate}
        onFavorite={() => setFavorite(toggleFavorite(piece.slug))}
        onShare={() => {
          setSharing(true);
          track("share_card", { slug: piece.slug });
        }}
        onVoice={(uri) => {
          setVoiceURI(uri);
          engineRef.current?.setVoice?.(uri);
        }}
      />

      {sharing && <SharePanel piece={piece} onClose={() => setSharing(false)} />}
    </main>
  );
}

function SourceCard({ source }: { source: NonNullable<Piece["source"]> }) {
  const published = source.publishedAt ? formatSourceDate(source.publishedAt) : "历史内容未记录";
  const retrieved = source.retrievedAt ? formatSourceDate(source.retrievedAt) : null;
  const reviewed = source.factReview?.reviewedAt
    ? formatSourceDate(source.factReview.reviewedAt)
    : null;
  const verificationLabel = source.factReview
    ? "事实已复核"
    : source.basis === "full-text"
      ? "已取得完整原文"
      : "历史内容";
  return (
    <aside className="mt-7 rounded-2xl border border-line bg-surface p-5 shadow-[0_14px_36px_rgba(27,48,38,0.05)]" aria-label="原始来源">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">原始来源</p>
        <span className="rounded-full bg-accent-wash px-2.5 py-1 text-xs text-accent">
          {verificationLabel}
        </span>
      </div>
      <p className="mt-4 text-base font-medium text-accent">{source.name}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-soft">{source.originalTitle}</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 text-xs text-ink-faint">
        <div className="space-y-1">
          <p>原文发布：{published}</p>
          {retrieved && <p>取得原文：{retrieved}</p>}
          {reviewed && <p>事实复核：{reviewed}</p>}
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm text-ink-soft transition hover:border-accent hover:text-ink active:scale-[0.98]"
        >
          查看原文
          <ArrowSquareOut size={16} weight="regular" aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}

function formatSourceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function PlayerBar({
  available,
  state,
  rate,
  progress,
  favorite,
  voices,
  onToggle,
  onSkip,
  onRate,
  onFavorite,
  onShare,
  onVoice,
}: {
  available: boolean;
  state: PlayState;
  rate: number;
  progress: number;
  favorite: boolean;
  voices: SpeechSynthesisVoice[];
  onToggle: () => void;
  onSkip: (d: number) => void;
  onRate: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onVoice: (uri: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/92 shadow-[0_-12px_40px_rgba(20,32,26,0.08)] backdrop-blur-xl">
      <div
        role="progressbar"
        aria-label="朗读进度"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-0.5 bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
      <div className="mx-auto flex max-w-2xl items-center gap-1.5 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:gap-2 sm:px-6">
        {available ? (
          <>
            <IconButton label="上一句" onClick={() => onSkip(-1)}>
              <SkipBackIcon size={20} weight="regular" />
            </IconButton>

            <button
              onClick={onToggle}
              aria-label={state === "playing" ? "暂停" : "播放"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-surface transition-transform active:scale-95"
            >
              {state === "playing" ? (
                <PauseIcon size={22} weight="fill" />
              ) : (
                <PlayIcon size={22} weight="fill" />
              )}
            </button>

            <IconButton label="下一句" onClick={() => onSkip(1)}>
              <SkipForwardIcon size={20} weight="regular" />
            </IconButton>

            <div className="ml-auto flex items-center gap-3">
              {voices.length > 1 && (
                <select
                  aria-label="切换朗读音色"
                  defaultValue=""
                  onChange={(e) => e.target.value && onVoice(e.target.value)}
                  className="max-w-28 rounded-md border border-line bg-transparent px-2 py-1 font-mono text-xs text-ink-soft outline-none transition-colors hover:text-ink"
                >
                  <option value="" disabled>
                    音色
                  </option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={onShare}
                aria-label="分享卡片"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink active:scale-[0.96]"
              >
                <ShareNetwork size={20} weight="regular" />
              </button>
              <button
                onClick={onFavorite}
                aria-label={favorite ? "取消收藏" : "收藏"}
                aria-pressed={favorite}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-colors active:scale-[0.96]",
                  favorite
                    ? "text-rose-deep"
                    : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
                )}
              >
                <HeartIcon size={20} weight={favorite ? "fill" : "regular"} />
              </button>
              <button
                onClick={onRate}
                aria-label={`切换播放速度，当前 ${rate} 倍`}
                className="min-h-11 min-w-11 rounded-full px-2.5 font-mono text-xs text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink active:scale-[0.96]"
              >
                {rate}×
              </button>
              <span className="hidden font-mono text-[0.65rem] text-ink-faint sm:inline">
                <kbd>空格</kbd> 播放　<kbd>← →</kbd> 跳句
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            当前浏览器不支持语音朗读，可换用 Chrome 或 Safari。
          </p>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink active:scale-[0.96]"
    >
      {children}
    </button>
  );
}
