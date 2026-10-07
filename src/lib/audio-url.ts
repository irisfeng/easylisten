/**
 * 预生成音频的根地址。音频存放在对象存储(Cloudflare R2)而不是 git 仓库，
 * 由 NEXT_PUBLIC_AUDIO_BASE_URL 指向其公开域名；未配置时回落到站内 /audio，
 * 兼容音频仍随仓库发布的阶段。迁移步骤见 docs/audio-storage.md。
 */
const AUDIO_BASE = (process.env.NEXT_PUBLIC_AUDIO_BASE_URL || "/audio").replace(/\/+$/, "");

/** unit 是音轨目录名：<slug>、<slug>-m(男声)或 <slug>-en(英文)。 */
export function audioUrl(unit: string): string {
  return `${AUDIO_BASE}/${unit}/full.mp3`;
}
