/**
 * 在同一个 Actions 工作区内重试完整音频契约。synthesize.mjs 每轮都会保存
 * 已成功音轨与 manifest；下一轮只续传缺口，不重新选稿，也不重复生成成功音轨。
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { resolveProcessRetryPlan } from "./lib/process-recovery.mjs";

const { attempts, delaysMs } = resolveProcessRetryPlan(process.env);
const script = resolve(import.meta.dirname, "synthesize.mjs");

for (let attempt = 1; attempt <= attempts; attempt++) {
  const result = spawnSync(process.execPath, [script], {
    cwd: resolve(import.meta.dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status === 0) process.exit(0);
  if (attempt < attempts) {
    const waitMs = delaysMs[attempt - 1];
    console.log(
      `音频契约第 ${attempt}/${attempts} 轮未完成，${Math.ceil(waitMs / 1000)} 秒后只补缺口`,
    );
    if (waitMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
  }
}

console.error(`音频契约连续 ${attempts} 轮未完成，保留失败并停止发布`);
process.exit(1);
