"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgeBand, Piece } from "@/lib/content";
import { categoryOf, listenMinutes } from "@/lib/content";
import type { QueueItem, Tracks } from "@/lib/audio-tracks";
import {
  loadAgeBand,
  loadPlayback,
  saveAutoContinue,
  savePosition,
  saveRate,
} from "@/lib/playback";
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
  primeAudio,
  splitSentences,
  type SpeechEngine,
} from "@/lib/tts";
import { cn } from "@/lib/utils";
import { SharePanel } from "./Share";
import {
  LanguageSwitch,
  VoiceSwitch,
  type ListeningLanguage,
  type VoiceGender,
} from "@/components/VoiceSwitch";
import {
  ArrowLeft,
  ArrowSquareOut,
  CircleNotch,
  Heart as HeartIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  ShareNetwork,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
} from "@phosphor-icons/react";

const RATES = [0.8, 1, 1.25, 1.5];

type PlayState = "idle" | "playing" | "paused";

/** 按本机声线偏好挑一篇稿件的中文音轨；没有预生成音频时返回 null。 */
function preferredUnit(item: QueueItem, gender: VoiceGender): string | null {
  const male = `${item.slug}-m`;
  if (gender === "m" && item.units.includes(male)) return male;
  return item.units.includes(item.slug) ? item.slug : null;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function Reader({
  piece,
  tracks,
  queue,
}: {
  piece: Piece;
  /** 这篇稿件现有的音轨及其逐句时间轴(服务端从 manifest 里挑出)。 */
  tracks: Tracks;
  /** 同一期节目单，按出刊顺序。 */
  queue: QueueItem[];
}) {
  const cat = categoryOf(piece.category);
  const router = useRouter();

  // 组件在篇与篇之间复用：上一篇选了英文而这一篇没有英文稿时回到中文。
  const [chosenLang, setLang] = useState<ListeningLanguage>("zh");
  const lang: ListeningLanguage = piece.en ? chosenLang : "zh";
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
  const [buffering, setBuffering] = useState(false);
  const [problem, setProblem] = useState(false);
  const [resumable, setResumable] = useState(false);
  const [autoContinue, setAutoContinue] = useState(true);
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  // 双声篇目(有 -m 变体)可切男/女声,偏好记在本地。读到本机偏好之前为 null：
  // 引擎要等它确定后再建，否则会先按女声加载、把连续播放交接过来的男声打断。
  const [storedGender, setGender] = useState<VoiceGender | null>(null);
  useEffect(() => {
    setGender(loadPrefs().voiceGender ?? "f");
    const playback = loadPlayback();
    setRate(playback.rate);
    setAutoContinue(playback.autoContinue);
    setAgeBand(loadAgeBand());
  }, []);
  const gender = storedGender ?? "f";
  const hasMale = !piece.en && `${piece.slug}-m` in tracks;

  const audioSlug =
    lang === "en"
      ? `${piece.slug}-en`
      : gender === "m" && hasMale
        ? `${piece.slug}-m`
        : piece.slug;
  const timings = tracks[audioSlug];
  const hasAudio = Boolean(timings);

  // 当期节目单里排在本篇之后、适合当前年龄段的稿件。
  const upNext = useMemo(() => {
    const position = queue.findIndex((item) => item.slug === piece.slug);
    if (position < 0) return [];
    return queue
      .slice(position + 1)
      .filter((item) => !ageBand || !item.ageBands?.length || item.ageBands.includes(ageBand));
  }, [queue, piece.slug, ageBand]);
  const upNextRef = useRef(upNext);
  upNextRef.current = upNext;
  const autoContinueRef = useRef(autoContinue);
  autoContinueRef.current = autoContinue;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const currentRef = useRef(current);
  currentRef.current = current;
  // 切换男/女声时把正在听的位置带到新音轨上(两条音轨的句子一一对应)。
  const carryRef = useRef<{ index: number; playing: boolean } | null>(null);

  /** 立刻开始播放下一篇并跳到它的阅读页；必须在手势或 ended 回调里调用。 */
  const playNext = (item: QueueItem) => {
    const unit = preferredUnit(item, gender);
    if (unit) primeAudio(unit);
    router.push(`/listen/${item.slug}`);
  };
  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

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
  // 每篇每次访问只报一次"开始听",作完听率的分母；记 slug 是因为组件会跨篇复用
  const startTrackedRef = useRef<string | null>(null);
  const trackStart = () => {
    if (startTrackedRef.current === piece.slug) return;
    startTrackedRef.current = piece.slug;
    track("listen_start", { slug: piece.slug });
  };
  // 暂停时拖过进度条：再点播放要从新位置开始，而不是恢复原位置。
  const scrubbedRef = useRef(false);

  useEffect(() => {
    if (storedGender === null) return;
    // 切换文章时清零播放状态,避免复用组件把上一篇的进度记到新文章上
    maxHeardRef.current = -1;
    lastRecordedRef.current = -1;
    setCurrent(-1);
    setState("idle");
    setBuffering(false);
    setProblem(false);
    setResumable(false);
    setFavorite(loadPrefs().favorites.includes(piece.slug));
    const engine = createSpeechEngine({
      slug: audioSlug,
      hasAudio,
      timings,
      voiceURI: loadPrefs().voiceURI,
    });
    engineRef.current = engine;
    engine.onSentence((i) => setCurrent(i));
    engine.onPlayState?.((playing) => {
      setState(playing ? "playing" : "paused");
      if (playing) setProblem(false);
    });
    engine.onBuffering?.(setBuffering);
    engine.onProblem?.(() => {
      setProblem(true);
      setState("paused");
    });
    engine.setRate(rateRef.current);

    const carry = carryRef.current;
    carryRef.current = null;
    if (engine.attach?.()) {
      // 连续播放：上一篇结束时已经开始播这一篇，这里只接管高亮与控制。
      setAvailable(true);
      setState("playing");
      trackStart();
    } else {
      setAvailable(engine.isAvailable());
      if (carry && carry.index >= 0) {
        setCurrent(carry.index);
        if (carry.playing) {
          engine.speak(sentences, carry.index);
          setState("playing");
        }
      } else if (lang === "zh") {
        const saved = loadPlayback().positions[piece.slug] ?? 0;
        if (saved > 0 && saved < sentences.length - 1) {
          setCurrent(saved);
          setResumable(true);
        }
      }
    }

    // 手机上切后台/杀标签页不会触发组件卸载,进度必须在这些时刻落盘
    let finished = false;
    const flush = () => {
      if (maxHeardRef.current > lastRecordedRef.current) {
        lastRecordedRef.current = maxHeardRef.current;
        recordListen(piece, (maxHeardRef.current + 1) / sentences.length);
      }
      // 只有真正听过才记续听位置；只是打开看看不能把上次的位置冲掉。
      if (lang === "zh" && !finished && maxHeardRef.current >= 0 && currentRef.current > 0) {
        savePosition(piece.slug, currentRef.current);
      }
    };
    engine.onDone(() => {
      maxHeardRef.current = sentences.length - 1;
      finished = true;
      setState("idle");
      setCurrent(-1);
      flush();
      savePosition(piece.slug, null);
      // 完听事件:与 listen_start 相除即得每篇完听率
      track("listen_done", { slug: piece.slug });
      const next = upNextRef.current[0];
      if (next && autoContinueRef.current && preferredUnit(next, gender)) {
        track("auto_continue", { from: piece.slug, to: next.slug });
        playNextRef.current(next);
      }
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
    // sentences 随 piece/lang 变化，已由 audioSlug 覆盖；trackStart 只读 piece
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece, audioSlug, sentences.length, hasAudio, timings, storedGender]);


  const startFrom = (i: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    trackStart();
    scrubbedRef.current = false;
    setProblem(false);
    setResumable(false);
    engine.speak(sentences, i);
    setState("playing");
  };

  // 拖动进度：播放中直接跳过去；没在播时只移动位置，等用户点播放。
  const seekTo = (i: number) => {
    if (state === "playing") {
      startFrom(i);
      return;
    }
    engineRef.current?.pause();
    scrubbedRef.current = true;
    setCurrent(i);
    setResumable(false);
  };

  const toggle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state === "playing") {
      engine.pause();
      setState("paused");
    } else if (state === "paused" && !scrubbedRef.current) {
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
    saveRate(next);
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
      // 焦点在按钮、进度条、复选框上时，空格和方向键归它们自己用。
      if ((e.target as HTMLElement | null)?.closest("button, input, select, textarea, a")) return;
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
          {hasMale && (
            <VoiceSwitch
              value={gender}
              onChange={(next) => {
                if (next === gender) return;
                carryRef.current = { index: current, playing: state === "playing" };
                setGender(next);
                setVoiceGender(next);
                track("voice_switch", { slug: piece.slug, gender: next });
              }}
              className="ml-auto"
            />
          )}
          {piece.en && (
            <LanguageSwitch
              value={lang}
              onChange={(next) => {
                setLang(next);
                track("language_switch", { slug: piece.slug, language: next });
              }}
              className="ml-auto"
            />
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

      {queue.length > 1 && (
        <UpNext
          items={upNext}
          autoContinue={autoContinue}
          onAutoContinue={(next) => {
            setAutoContinue(next);
            saveAutoContinue(next);
          }}
          onPlay={playNext}
        />
      )}

      <PlayerBar
        available={available}
        state={state}
        rate={rate}
        buffering={buffering}
        problem={problem}
        resumable={resumable}
        current={current}
        total={sentences.length}
        timings={timings}
        onSeek={seekTo}
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
  buffering,
  problem,
  resumable,
  current,
  total,
  timings,
  onSeek,
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
  buffering: boolean;
  problem: boolean;
  resumable: boolean;
  current: number;
  total: number;
  timings?: number[];
  onSeek: (index: number) => void;
  favorite: boolean;
  voices: SpeechSynthesisVoice[];
  onToggle: () => void;
  onSkip: (d: number) => void;
  onRate: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onVoice: (uri: string) => void;
}) {
  const position = Math.max(0, current);
  // 有时间轴时显示"已听 / 总时长"，浏览器朗读兜底时只能显示句数。
  const elapsed = timings ? formatClock(timings[position] ?? 0) : `${position + 1}`;
  const length = timings ? formatClock(timings[timings.length - 1] ?? 0) : `${total} 句`;
  const notice = problem
    ? "音频没有加载出来，检查网络后再点一次播放"
    : resumable && state === "idle"
      ? "上次听到这里，点播放继续"
      : null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/92 shadow-[0_-12px_40px_rgba(20,32,26,0.08)] backdrop-blur-xl">
      {notice && (
        <p
          role="status"
          className={cn(
            "mx-auto max-w-2xl px-4 pt-2.5 text-xs sm:px-6",
            problem ? "text-rose-deep" : "text-ink-soft",
          )}
        >
          {notice}
        </p>
      )}
      {available && total > 1 && (
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-1 sm:px-6">
          <span className="w-9 shrink-0 font-mono text-[0.68rem] tabular-nums text-ink-faint">{elapsed}</span>
          <input
            type="range"
            aria-label="朗读进度"
            aria-valuetext={`第 ${position + 1} 句，共 ${total} 句`}
            min={0}
            max={total - 1}
            step={1}
            value={position}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="h-9 min-w-0 flex-1 cursor-pointer accent-accent"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[0.68rem] tabular-nums text-ink-faint">{length}</span>
        </div>
      )}
      <div className="mx-auto flex max-w-2xl items-center gap-1.5 px-4 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:gap-2 sm:px-6">
        {available ? (
          <>
            <IconButton label="上一句" onClick={() => onSkip(-1)}>
              <SkipBackIcon size={20} weight="regular" />
            </IconButton>

            <button
              onClick={onToggle}
              aria-label={state === "playing" ? (buffering ? "加载中，点按暂停" : "暂停") : "播放"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-surface transition-transform active:scale-95"
            >
              {buffering && state === "playing" ? (
                <CircleNotch size={22} weight="bold" className="animate-spin" />
              ) : state === "playing" ? (
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

function UpNext({
  items,
  autoContinue,
  onAutoContinue,
  onPlay,
}: {
  items: QueueItem[];
  autoContinue: boolean;
  onAutoContinue: (next: boolean) => void;
  onPlay: (item: QueueItem) => void;
}) {
  return (
    <section aria-labelledby="up-next-heading" className="mt-12 border-t border-line pt-7">
      <h2 id="up-next-heading" className="font-serif text-xl">
        {items.length ? "接着听" : "今天的节目单听完了"}
      </h2>
      {items.length > 0 ? (
        <>
          <ol className="mt-3">
            {items.map((item, index) => (
              <li key={item.slug} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => onPlay(item)}
                  className="group flex min-h-14 w-full items-center gap-3 py-3 text-left"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ink-faint text-ink transition group-hover:border-accent group-hover:text-accent">
                    <PlayIcon aria-hidden size={14} weight="fill" className="translate-x-px" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-serif text-lg leading-snug group-hover:text-accent">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                      {index === 0 ? "下一篇　" : ""}
                      {item.minutes} 分钟
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={(event) => onAutoContinue(event.target.checked)}
              className="size-5 accent-accent"
            />
            听完自动播放下一篇，到今天的最后一篇为止
          </label>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          每天就这几篇。<Link href="/" className="text-accent hover:underline">回首页</Link>看看往期。
        </p>
      )}
    </section>
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
