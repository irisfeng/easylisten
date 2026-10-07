/**
 * 核对 manifest 登记的每条音轨都能从公开音频地址取到。回填对象存储之后、
 * 把音频移出仓库之前必须跑通：
 *   AUDIO_PUBLIC_BASE_URL=https://audio.example.com/audio node scripts/verify-audio.mjs
 * 也可以只核对指定音轨：node scripts/verify-audio.mjs <unit> <unit>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = (
  process.env.AUDIO_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_AUDIO_BASE_URL ||
  ""
).replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  throw new Error("请把 AUDIO_PUBLIC_BASE_URL 设为音频的公开地址，例如 https://audio.example.com/audio");
}

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../public/audio/manifest.json"), "utf8"),
);
const units = process.argv.length > 2 ? process.argv.slice(2) : manifest.slugs;
const failures = [];

async function check(unit) {
  const url = `${base}/${unit}/full.mp3`;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
    const size = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok) failures.push(`${unit}: HTTP ${res.status}`);
    else if (size === 0) failures.push(`${unit}: 空文件`);
  } catch (error) {
    failures.push(`${unit}: ${error.message}`);
  }
}

const queue = [...units];
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (queue.length) await check(queue.shift());
  }),
);

if (failures.length) {
  throw new Error(`${failures.length}/${units.length} 条音轨无法从 ${base} 取到：\n- ${failures.join("\n- ")}`);
}
console.log(`${units.length} 条音轨均可从 ${base} 取到`);
