import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../src/app/globals.css", import.meta.url);

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16) / 255);
  const linear = values.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("浅色和深色朗读高亮都达到 WCAG AA 文字对比度", async () => {
  const css = await readFile(cssUrl, "utf8");
  const pairs = [...css.matchAll(
    /--color-highlight:\s*(#[0-9a-f]{6});[\s\S]*?--color-highlight-ink:\s*(#[0-9a-f]{6});/gi,
  )].map((match) => ({ background: match[1], foreground: match[2] }));

  assert.equal(pairs.length, 3, "应覆盖浅色、显式深色和系统深色三组主题变量");
  for (const pair of pairs) {
    assert.ok(
      contrast(pair.foreground, pair.background) >= 4.5,
      `${pair.foreground} / ${pair.background} 对比度不足`,
    );
  }
});
