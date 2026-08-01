import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyWorkflowUrl = new URL("../.github/workflows/daily-curation.yml", import.meta.url);
const recoveryWorkflowUrl = new URL(
  "../.github/workflows/recover-daily-curation.yml",
  import.meta.url,
);
const repairWorkflowUrl = new URL("../.github/workflows/repair-audio.yml", import.meta.url);
const watchdogWorkflowUrl = new URL(
  "../.github/workflows/watch-daily-curation.yml",
  import.meta.url,
);

test("每日任务在音频失败后先保存可续跑快照再停止发布", async () => {
  const workflow = await readFile(dailyWorkflowUrl, "utf8");
  const baseSnapshot = workflow.indexOf("name: 保存已审核节目单快照");
  const synthesis = workflow.indexOf("id: synthesis");
  const snapshot = workflow.indexOf("name: 保存已生成的部分音轨");
  const reject = workflow.indexOf("name: 音频不完整时停止发布");

  assert.ok(baseSnapshot >= 0 && baseSnapshot < synthesis, "耗时音频前必须先保存节目单");
  assert.ok(synthesis >= 0, "音频步骤需要暴露 outcome");
  assert.ok(snapshot > synthesis, "失败快照必须在音频步骤之后");
  assert.ok(reject > snapshot, "必须先保存快照，再让主任务失败");
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /steps\.synthesis\.outcome == 'failure'/);
  assert.match(workflow, /daily-recovery-base-/);
  assert.match(workflow, /daily-recovery-audio-/);
});

test("失败恢复任务下载原运行快照并只补音轨后提交", async () => {
  const workflow = await readFile(recoveryWorkflowUrl, "utf8");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["每日精选"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'cancelled'/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /path: _recovery_snapshot/);
  assert.match(workflow, /test -f _recovery_snapshot\/content\/daily\.json/);
  assert.match(workflow, /不能拿主分支旧刊冒充恢复成功/);
  assert.match(
    workflow,
    /run-id: \$\{\{ github\.event\.workflow_run\.id \|\| inputs\.source_run_id \}\}/,
  );
  assert.match(workflow, /node scripts\/run-synthesis-with-recovery\.mjs/);
  assert.match(workflow, /git add content\/daily\.json content\/editorial\.json public\/audio public\/editorial/);
});

test("缺刊看门狗每天只触发一次有界补发，并由成本闸门防止重复计费", async () => {
  const workflow = await readFile(watchdogWorkflowUrl, "utf8");
  assert.match(workflow, /cron: "17 1 \* \* \*"/);
  assert.match(workflow, /node scripts\/check-daily-run\.mjs/);
  assert.match(workflow, /steps\.guard\.outputs\.should_run == 'true'/);
  assert.match(workflow, /gh workflow run daily-curation\.yml/);
  assert.doesNotMatch(workflow, /force_regenerate=true/);
});

test("成功出刊与成功恢复都会自动关闭当日失败告警", async () => {
  const daily = await readFile(dailyWorkflowUrl, "utf8");
  const recovery = await readFile(recoveryWorkflowUrl, "utf8");
  assert.match(daily, /出刊成功后关闭当日告警/);
  assert.match(recovery, /恢复成功后关闭当日告警/);
  assert.match(daily, /gh issue close/);
  assert.match(recovery, /gh issue close/);
});

test("恢复任务没有快照时必须失败告警，不能显示假成功", async () => {
  const workflow = await readFile(recoveryWorkflowUrl, "utf8");
  const guard = workflow.indexOf("name: 确认并恢复出刊快照");
  const synthesis = workflow.indexOf("name: 只补快照中的缺失音轨");
  const alert = workflow.indexOf("name: 恢复失败告警");

  assert.ok(guard >= 0 && guard < synthesis);
  assert.ok(alert > synthesis);
  assert.match(workflow, /if: failure\(\)/);
  assert.doesNotMatch(workflow, /continue-on-error: true[\s\S]{0,120}actions\/download-artifact/);
});

test("恢复任务既能自动接管失败运行也能人工指定快照，并允许整轨 MiniMax 英文兜底", async () => {
  const workflow = await readFile(recoveryWorkflowUrl, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_run_id:/);
  assert.match(workflow, /github\.event\.workflow_run\.id \|\| inputs\.source_run_id/);
  assert.match(workflow, /ALLOW_MINIMAX_ENGLISH_FALLBACK: "true"/);
});

test("已审核稿件修复任务支持只重做指定音轨", async () => {
  const workflow = await readFile(repairWorkflowUrl, "utf8");
  assert.match(workflow, /units:/);
  assert.match(workflow, /TARGET_AUDIO_UNITS: \$\{\{ inputs\.units \}\}/);
});
