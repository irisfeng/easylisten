/**
 * 生成 App 图标:纸色画布 + 墨色声波三柱,与站内设计系统同源。
 * 产物提交进仓库,构建不依赖本脚本;改设计后重跑一次即可:
 *   node scripts/icons.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "public/icons");
mkdirSync(OUT, { recursive: true });

// 三柱声波居中于画布,安全区(maskable 内 60%)之内
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#f7f6f3"/>
  <g fill="#141413">
    <rect x="332" y="412" width="72" height="200" rx="36"/>
    <rect x="476" y="312" width="72" height="400" rx="36"/>
    <rect x="620" y="452" width="72" height="120" rx="36"/>
  </g>
</svg>`;

const src = Buffer.from(SVG);
const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["icon-1024.png", 1024], // App Store 素材
];

for (const [name, size] of targets) {
  await sharp(src).resize(size, size).png().toFile(resolve(OUT, name));
  console.log(`ok ${name} (${size}x${size})`);
}
writeFileSync(resolve(OUT, "icon.svg"), SVG);
console.log("ok icon.svg");
