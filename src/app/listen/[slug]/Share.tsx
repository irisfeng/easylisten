"use client";

/**
 * 少年刊分享摘页：前端 canvas 生成，适合保存到相册或直接分享。
 * 卡片保留标题、适龄信息和原始来源，二维码回到轻听收听页。
 */

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { track } from "@vercel/analytics";
import QRCode from "qrcode";
import type { Piece } from "@/lib/content";
import { categoryOf, listenMinutes } from "@/lib/content";

const W = 750;
const H = 1000;
const PAPER = "#f3f3f0";
const SURFACE = "#fafaf7";
const INK = "#181b1a";
const INK_SOFT = "#666c69";
const INK_FAINT = "#8b918e";
const LINE = "#d5d8d6";
const ACCENT = "#3979a7";

const SERIF = 'Newsreader, Georgia, "Songti SC", "STSong", "Noto Serif SC", serif';
const SANS = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

// 不允许悬于行首的标点，宁可本行微溢出，也不让下一行以它开头。
const NO_LEAD = "\u3001\u3002\uFF0C,.\uFF1B;\uFF1A:\uFF1F?\uFF01!\u300D\u300F\u201D\u2019\u2026\uFF09)\u300B%\u2103";

function cleanText(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "，").replace(/\s+/g, " ").trim();
}

/** 中文按字符折行，返回各行文本。 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of cleanText(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line && !NO_LEAD.includes(ch)) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clippedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrap(ctx, text, maxWidth);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

function ageLabel(piece: Piece): string {
  if (!piece.ageBands?.length || piece.ageBands.length === 3) return "适合 6-16 岁";
  return `适合 ${piece.ageBands.join("、")} 岁`;
}

function displayDate(value: string): string {
  return value.replaceAll("-", ".");
}

async function drawCard(piece: Piece): Promise<string> {
  await document.fonts?.ready;

  const cat = categoryOf(piece.category);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const M = 64;

  // 刊头：与首页同一套层级，不再使用旧的音频柱状标志。
  ctx.fillStyle = INK_FAINT;
  ctx.font = `18px ${MONO}`;
  ctx.fillText("E A S Y L I S T E N", M, 66);

  ctx.fillStyle = INK;
  ctx.font = `600 36px ${SERIF}`;
  ctx.fillText("轻听 · 少年刊", M, 116);

  ctx.fillStyle = INK_FAINT;
  ctx.font = `18px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(displayDate(piece.publishedAt), W - M, 108);
  ctx.textAlign = "left";

  ctx.fillStyle = LINE;
  ctx.fillRect(M, 148, W - M * 2, 2);

  // 今日选读：一条克制的蓝色编辑标记，承接首页文章条目的视觉语言。
  ctx.fillStyle = ACCENT;
  ctx.fillRect(M, 184, 4, 56);
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText("今日选读", M + 20, 204);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `20px ${SANS}`;
  ctx.fillText(`${cat.name}　${listenMinutes(piece)} 分钟　${ageLabel(piece)}`, M + 20, 236);

  // 大标题：保留少年刊的编辑部版面感，长中文标题最多四行。
  ctx.fillStyle = INK;
  ctx.font = `600 54px ${SERIF}`;
  const titleLines = clippedLines(ctx, piece.title, W - M * 2, 4);
  let y = 310;
  for (const line of titleLines) {
    ctx.fillText(line, M, y);
    y += 68;
  }

  // 导语不用引号或斜体，避免退回旧式金句卡。
  y += 22;
  ctx.fillStyle = INK_SOFT;
  ctx.font = `27px ${SANS}`;
  const introLines = clippedLines(ctx, piece.intro, W - M * 2, 3);
  for (const line of introLines) {
    ctx.fillText(line, M, y);
    y += 43;
  }

  // 来源区固定在页脚上方，保证每次转发都能看到内容出处。
  const sourceTop = 712;
  ctx.fillStyle = LINE;
  ctx.fillRect(M, sourceTop, W - M * 2, 2);
  ctx.fillStyle = INK_FAINT;
  ctx.font = `17px ${MONO}`;
  ctx.fillText("S O U R C E  /  原始来源", M, sourceTop + 34);

  ctx.fillStyle = INK;
  ctx.font = `600 25px ${SANS}`;
  ctx.fillText(cleanText(piece.source?.name ?? "轻听编辑部"), M, sourceTop + 72);

  ctx.fillStyle = INK_SOFT;
  ctx.font = `21px ${SANS}`;
  const original = piece.source?.originalTitle ?? piece.title;
  const [sourceTitle] = clippedLines(ctx, `原文标题：${original}`, W - M * 2, 1);
  ctx.fillText(sourceTitle, M, sourceTop + 108);

  ctx.fillStyle = LINE;
  ctx.fillRect(M, 850, W - M * 2, 2);

  // 页脚与二维码：让接收者知道这是一篇可直接收听的选读。
  ctx.fillStyle = INK;
  ctx.font = `600 27px ${SERIF}`;
  ctx.fillText("轻听 · 少年刊", M, 894);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `20px ${SANS}`;
  ctx.fillText("世界很大，不急着有标准答案", M, 929);
  ctx.fillStyle = INK_FAINT;
  ctx.font = `17px ${MONO}`;
  ctx.fillText("easylisten.shddai.net", M, 962);

  const qrSize = 100;
  const qrX = W - M - qrSize;
  const qrY = 875;
  ctx.fillStyle = INK_FAINT;
  ctx.font = `16px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("扫码听全文", W - M, 868);
  ctx.textAlign = "left";

  const qr = await QRCode.toDataURL(`https://easylisten.shddai.net/listen/${piece.slug}`, {
    width: qrSize,
    margin: 1,
    color: { dark: INK, light: SURFACE },
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR code failed to load"));
    image.src = qr;
  });
  ctx.fillStyle = SURFACE;
  ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
  ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

  return canvas.toDataURL("image/png");
}

export function SharePanel({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(false);

    drawCard(piece)
      .then((nextUrl) => {
        if (!alive) return;
        setUrl(nextUrl);
        try {
          const probe = new File([new Blob()], "x.png", { type: "image/png" });
          setCanShare(!!navigator.canShare?.({ files: [probe] }));
        } catch {
          setCanShare(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });

    return () => {
      alive = false;
    };
  }, [piece, generation]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const systemShare = async () => {
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `轻听少年刊-${piece.slug}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
      track("share_card_sent", { slug: piece.slug });
    } catch {
      // 用户取消系统分享面板时不提示错误。
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/45 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="share-card-title"
        aria-modal="true"
        role="dialog"
        className="max-h-[96dvh] w-full max-w-sm overflow-y-auto rounded-t-[1.5rem] bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:rounded-[1.5rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="font-mono text-[0.65rem] tracking-[0.2em] text-ink-faint">EASYLISTEN</p>
            <h2 id="share-card-title" className="mt-1 font-serif text-xl text-ink">生成少年刊分享卡</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭分享卡"
            className="flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink active:scale-95"
          >
            <X aria-hidden size={20} />
          </button>
        </header>

        {url ? (
          // 微信等不支持文件分享的环境，可以长按这张图保存。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${piece.title}的少年刊分享卡`}
            className="mx-auto max-h-[68dvh] w-full rounded-[0.75rem] border border-line object-contain"
          />
        ) : error ? (
          <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-[0.75rem] border border-line bg-paper px-8 text-center">
            <p className="font-serif text-lg text-ink">卡片没有生成成功</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">网络或浏览器刚刚开了小差，可以再试一次。</p>
            <button
              type="button"
              onClick={() => setGeneration((value) => value + 1)}
              className="mt-5 min-h-11 rounded-full border border-line px-5 text-sm text-ink-soft transition hover:border-accent hover:text-ink active:scale-[0.98]"
            >
              重新生成
            </button>
          </div>
        ) : (
          <div className="aspect-[3/4] animate-pulse rounded-[0.75rem] border border-line bg-paper p-7" aria-label="正在生成分享卡">
            <div className="h-2 w-24 bg-line" />
            <div className="mt-5 h-7 w-40 bg-line" />
            <div className="mt-12 h-12 w-full bg-line" />
            <div className="mt-3 h-12 w-4/5 bg-line" />
            <div className="mt-8 h-4 w-full bg-line" />
            <div className="mt-3 h-4 w-3/4 bg-line" />
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          {canShare && url && (
            <button
              type="button"
              onClick={systemShare}
              className="min-h-11 flex-1 rounded-full bg-ink px-5 text-sm text-paper transition-transform active:scale-[0.98]"
            >
              分享图片
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-5 text-sm text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink active:scale-[0.98]"
          >
            关闭
          </button>
        </div>
        {!canShare && url && (
          <p className="mt-1 text-center text-xs leading-6 text-ink-faint">
            长按卡片保存，发给家人或朋友
          </p>
        )}
      </section>
    </div>
  );
}
