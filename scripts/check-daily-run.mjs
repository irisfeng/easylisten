/**
 * 同一天只允许自动出刊一次。手动重跑默认也跳过付费模型；只有在 Actions
 * 页面明确勾选 force_regenerate，才会重新选稿、合成语音和生成图片。
 */

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const issueDate =
  process.env.ISSUE_DATE ||
  new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" });
const forced = process.env.FORCE_REGENERATE === "true";
const editorial = JSON.parse(
  readFileSync(resolve(root, "content/editorial.json"), "utf8"),
);
const alreadyPublished = editorial.some((issue) => issue.date === issueDate);
const shouldRun = forced || !alreadyPublished;

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
}

if (!shouldRun) {
  console.log(`${issueDate} 已出刊：跳过选稿、MiniMax 与生图，避免重复计费。`);
  console.log("如确需替换当天内容，请手动运行并显式勾选 force_regenerate。 ");
} else if (forced) {
  console.log(`${issueDate} 已显式允许强制重做；本次会产生付费模型调用。`);
} else {
  console.log(`${issueDate} 尚未出刊，允许执行一次日刊流水线。`);
}
