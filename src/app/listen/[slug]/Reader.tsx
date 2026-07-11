"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Piece } from "@/lib/content";
import { categoryOf, listenMinutes } from "@/lib/content";
import { createSpeechEngine, splitSentences, type SpeechEngine } from "@/lib/tts";
import { cn } from "@/lib/utils";

const RATES = [0.8, 1, 1.25, 1.5];

type PlayState = "idle" | "playing" | "paused";

export default function Reader({ piece }: { piece: Piece }) {
  const cat = categoryOf(piece.category);

  // 把每段切成句子,并给每句分配一个全篇唯一的下标,
  // 这样朗读进度和文中高亮能对上号。
  const { paragraphs, sentences } = useMemo(() => {
    let counter = 0;
    const paras = piece.paragraphs.map((p) => {
      const parts = splitSentences([p]);
      return parts.map((text) => ({ text, index: counter++ }));
    });
    return { paragraphs: paras, sentences: splitSentences(piece.paragraphs) };
  }, [piece]);

  const engineRef = useRef<SpeechEngine | null>(null);
  const [available, setAvailable] = useState(true);
  const [state, setState] = useState<PlayState>("idle");
  const [current, setCurrent] = useState(-1);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const engine = createSpeechEngine();
    engineRef.current = engine;
    setAvailable(engine.isAvailable());
    engine.onSentence((i) => setCurrent(i));
    engine.onDone(() => {
      setState("idle");
      setCurrent(-1);
    });
    return () => engine.stop();
  }, []);

  const startFrom = (i: number) => {
    const engine = engineRef.current;
    if (!engine) return;
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

  // 空格键播放/暂停,方向键跳句。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") {
        skip(1);
      } else if (e.code === "ArrowLeft") {
        skip(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const progress =
    sentences.length > 0 && current >= 0
      ? ((current + 1) / sentences.length) * 100
      : 0;

  return (
    <main className="mx-auto max-w-2xl px-6 pb-40">
      <div className="pt-10">
        <Link
          href="/"
          className="font-mono text-xs text-ink-faint transition-colors hover:text-ink"
        >
          ← 返回
        </Link>
      </div>

      <article className="pt-8">
        <div className="mb-4 flex items-center gap-3">
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
            {listenMinutes(piece)} 分钟 · {piece.author} · {piece.publishedAt}
          </span>
        </div>

        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          {piece.title}
        </h1>

        <p className="mt-6 border-l-2 border-line pl-4 font-serif text-xl italic leading-relaxed text-ink-soft">
          {piece.intro}
        </p>

        <div className="mt-8 space-y-6 text-[1.075rem] leading-[1.85] text-ink">
          {paragraphs.map((para, pi) => (
            <p key={pi}>
              {para.map((s) => (
                <span
                  key={s.index}
                  data-index={s.index}
                  onClick={() => startFrom(s.index)}
                  className={cn(
                    "sentence",
                    current === s.index && "sentence-active",
                  )}
                >
                  {s.text}
                </span>
              ))}
            </p>
          ))}
        </div>
      </article>

      <PlayerBar
        available={available}
        state={state}
        rate={rate}
        progress={progress}
        onToggle={toggle}
        onSkip={skip}
        onRate={cycleRate}
      />
    </main>
  );
}

function PlayerBar({
  available,
  state,
  rate,
  progress,
  onToggle,
  onSkip,
  onRate,
}: {
  available: boolean;
  state: PlayState;
  rate: number;
  progress: number;
  onToggle: () => void;
  onSkip: (d: number) => void;
  onRate: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur">
      <div
        className="h-0.5 bg-ink transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-3.5">
        {available ? (
          <>
            <IconButton label="上一句" onClick={() => onSkip(-1)}>
              <SkipBack />
            </IconButton>

            <button
              onClick={onToggle}
              aria-label={state === "playing" ? "暂停" : "播放"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-surface transition-transform active:scale-95"
            >
              {state === "playing" ? <Pause /> : <Play />}
            </button>

            <IconButton label="下一句" onClick={() => onSkip(1)}>
              <SkipForward />
            </IconButton>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={onRate}
                className="rounded-md px-2.5 py-1 font-mono text-xs text-ink-soft transition-colors hover:bg-black/[0.04] hover:text-ink"
              >
                {rate}×
              </button>
              <span className="hidden font-mono text-[0.65rem] text-ink-faint sm:inline">
                <kbd>空格</kbd> 播放 · <kbd>← →</kbd> 跳句
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            当前浏览器不支持语音朗读,可换用 Chrome 或 Safari。
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.04] hover:text-ink"
    >
      {children}
    </button>
  );
}

/* 细线图标,统一 1.6 描边。 */
const S = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Play() {
  return (
    <svg {...S} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}
function Pause() {
  return (
    <svg {...S} fill="currentColor" stroke="none">
      <rect x="7" y="5.5" width="3.2" height="13" rx="1" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" />
    </svg>
  );
}
function SkipBack() {
  return (
    <svg {...S}>
      <path d="M18 7v10l-8-5z" />
      <line x1="7" y1="6.5" x2="7" y2="17.5" />
    </svg>
  );
}
function SkipForward() {
  return (
    <svg {...S}>
      <path d="M6 7v10l8-5z" />
      <line x1="17" y1="6.5" x2="17" y2="17.5" />
    </svg>
  );
}
