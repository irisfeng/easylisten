import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyWorkflowUrl = new URL("../.github/workflows/daily-curation.yml", import.meta.url);
const recoveryWorkflowUrl = new URL(
  "../.github/workflows/recover-daily-curation.yml",
  import.meta.url,
);

test("每日任务在音频失败后先保存可续跑快照再停止发布", async () => {
  const workflow = await readFile(dailyWorkflowUrl, "utf8");
  const synthesis = workflow.indexOf("id: synthesis");
  const snapshot = workflow.indexOf("name: 保存待恢复的出刊快照");
  const reject = workflow.indexOf("name: 音频不完整时停止发布");

  assert.ok(synthesis >= 0, "音频步骤需要暴露 outcome");
  assert.ok(snapshot > synthesis, "失败快照必须在音频步骤之后");
  assert.ok(reject > snapshot, "必须先保存快照，再让主任务失败");
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /steps\.synthesis\.outcome == 'failure'/);
});

test("失败恢复任务下载原运行快照并只补音轨后提交", async () => {
  const workflow = await readFile(recoveryWorkflowUrl, "utf8");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["每日精选"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(
    workflow,
    /run-id: \$\{\{ github\.event\.workflow_run\.id \|\| inputs\.source_run_id \}\}/,
  );
  assert.match(workflow, /node scripts\/run-synthesis-with-recovery\.mjs/);
  assert.match(workflow, /git add content\/daily\.json content\/editorial\.json public\/audio public\/editorial/);
});

test("恢复任务既能自动接管失败运行也能人工指定快照，并允许整轨 MiniMax 英文兜底", async () => {
  const workflow = await readFile(recoveryWorkflowUrl, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_run_id:/);
  assert.match(workflow, /github\.event\.workflow_run\.id \|\| inputs\.source_run_id/);
  assert.match(workflow, /ALLOW_MINIMAX_ENGLISH_FALLBACK: "true"/);
});
