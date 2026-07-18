"use client";

/**
 * 分享卡片:纯前端 canvas 绘制的金句图卡(纸色设计系统同源),
 * 微信生态里图片卡的触达优于会被折叠的链接。
 * - 支持系统分享面板的浏览器(iOS Safari 等)可直接把图片投给微信
 * - 微信内置浏览器降级为"长按图片保存"
 */

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import QRCode from "qrcode";
import type { Piece } from "@/lib/content";
import { categoryOf } from "@/lib/content";

const W = 750;
const H = 1000;
const PAPER = "#f7f6f3";
const INK = "#141413";
const INK_SOFT = "#787774";
const INK_FAINT = "#a8a49e";
const LINE = "#eaeaea";

const SERIF = 'Georgia, "Songti SC", "STSong", "Noto Serif SC", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

// 不允许悬于行首的标点:宁可本行微溢出,不让下一行以它开头
const NO_LEAD = "\u3001\u3002\uFF0C,.\uFF1B;\uFF1A:\uFF1F?\uFF01!\u300D\u300F\u201D\u2019\u2026\u2014\uFF09)\u300B%\u2103";

/** 中文按字符折行;返回各行文本。 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
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

async function drawCard(piece: Piece): Promise<string> {
  const cat = categoryOf(piece.category);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 纸色画布 + 细边框(保存后在白底聊天里仍有轮廓)
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const M = 72; // 页边距
  const headerY = 120; // 眉标基线
  const brandTop = H - 168; // 品牌区上缘

  // 先量文,再定位:短文章把正文块在可用空间里垂直居中,避免中段大片留白
  ctx.font = `600 56px ${SERIF}`;
  const titleLines = wrap(ctx, piece.title, W - M * 2).slice(0, 4);
  ctx.font = `italic 32px ${SERIF}`;
  const introLines = wrap(ctx, piece.intro, W - M * 2 - 36).slice(0, 5);
  const contentH = titleLines.length * 78 + 28 + introLines.length * 52;
  const areaTop = headerY + 84;
  const areaBottom = brandTop - 48;
  let y = areaTop + Math.max(0, (areaBottom - areaTop - contentH) / 2);

  // 眉标:领域 · 日期
  ctx.fillStyle = INK_FAINT;
  ctx.font = `24px ${MONO}`;
  ctx.fillText(`${cat.name} · ${piece.publishedAt}`, M, headerY);

  // 标题(衬线大字)
  ctx.fillStyle = INK;
  ctx.font = `600 56px ${SERIF}`;
  for (const l of titleLines) {
    ctx.fillText(l, M, y);
    y += 78;
  }
  y += 28;

  // 导语引文(左细线 + 衬线灰字)
  ctx.font = `italic 32px ${SERIF}`;
  const introTop = y - 40;
  ctx.fillStyle = INK_SOFT;
  for (const l of introLines) {
    ctx.fillText(l, M + 36, y);
    y += 52;
  }
  ctx.fillStyle = LINE;
  ctx.fillRect(M, introTop, 4, y - introTop - 12);

  // 底部品牌区:左列三行文字,右下角二维码,互不越界
  const by = brandTop + 28;
  ctx.fillStyle = INK;
  const bars: Array<[number, number]> = [
    [by - 20, 40],
    [by - 40, 80],
    [by - 12, 24],
  ];
  bars.forEach(([top, h], i) => {
    ctx.beginPath();
    ctx.roundRect(M + i * 22, top, 12, h, 6);
    ctx.fill();
  });
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText("轻听 EasyListen", M + 84, by + 4);
  ctx.fillStyle = INK_FAINT;
  ctx.font = `22px ${MONO}`;
  ctx.fillText("每天几篇 · 宁缺毋滥", M + 84, by + 42);
  ctx.fillText("easylisten.shddai.net", M + 84, by + 76);

  // 角落小二维码(直达本文),与左列文字保持安全间距
  const qr = await QRCode.toDataURL(`https://easylisten.shddai.net/listen/${piece.slug}`, {
    width: 108,
    margin: 1,
    color: { dark: INK, light: PAPER },
  });
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = qr;
  });
  ctx.drawImage(img, W - M - 108, by - 32, 108, 108);

  return canvas.toDataURL("image/png");
}

export function SharePanel({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let alive = true;
    drawCard(piece).then((u) => {
      if (!alive) return;
      setUrl(u);
      // 探测系统分享面板是否支持图片文件(iOS Safari 支持;微信内置浏览器不支持)
      try {
        const probe = new File([new Blob()], "x.png", { type: "image/png" });
        setCanShare(!!navigator.canShare?.({ files: [probe] }));
      } catch {
        setCanShare(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [piece]);

  const systemShare = async () => {
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `轻听-${piece.slug}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
      track("share_card_sent", { slug: piece.slug });
    } catch {
      // 用户取消分享面板,不作处理
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {url ? (
          // 卡片图:微信等环境靠长按此图保存
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="分享卡片" className="w-full rounded-md border border-line" />
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-ink-soft">
            正在生成卡片…
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          {canShare && (
            <button
              onClick={systemShare}
              className="flex-1 rounded-md bg-ink px-4 py-2.5 text-sm text-surface transition-transform active:scale-[0.98]"
            >
              分享图片
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-black/[0.04] hover:text-ink"
          >
            关闭
          </button>
        </div>
        {!canShare && url && (
          <p className="mt-2 text-center font-mono text-xs text-ink-faint">
            长按图片保存,发给朋友
          </p>
        )}
      </div>
    </div>
  );
}
