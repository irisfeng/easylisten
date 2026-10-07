/**
 * 构建前检查：站点必须有地方取音频。音频移出仓库后，如果忘了设置
 * NEXT_PUBLIC_AUDIO_BASE_URL，页面会全部指向不存在的 /audio 而无法播放；
 * 这里让构建失败，线上继续保留上一个可用版本。
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const audioDir = resolve(import.meta.dirname, "../public/audio");
const hasBundledAudio =
  existsSync(audioDir) &&
  readdirSync(audioDir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && existsSync(resolve(audioDir, entry.name, "full.mp3")),
  );

if (!process.env.NEXT_PUBLIC_AUDIO_BASE_URL && !hasBundledAudio) {
  console.error(
    "仓库里没有音频文件，也没有设置 NEXT_PUBLIC_AUDIO_BASE_URL；" +
      "请把它设为对象存储的公开地址（见 docs/audio-storage.md）。",
  );
  process.exit(1);
}
