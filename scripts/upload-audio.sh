#!/usr/bin/env bash
# 把整篇音频(full.mp3)上传到 S3 兼容的对象存储(Cloudflare R2)。
#
#   bash scripts/upload-audio.sh         只上传本轮生成或改动的音轨
#   bash scripts/upload-audio.sh --all   上传工作区里的全部音轨(一次性回填)
#
# 逐句 MP3 只是拼接 full.mp3 的中间产物，播放器不读取，不上传。
# 未配置 AUDIO_S3_BUCKET 时直接跳过。配置与迁移步骤见 docs/audio-storage.md。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${AUDIO_S3_BUCKET:-}" ]; then
  echo "未配置 AUDIO_S3_BUCKET，跳过对象存储上传"
  exit 0
fi
: "${AUDIO_S3_ENDPOINT:?已配置 AUDIO_S3_BUCKET 但缺少 AUDIO_S3_ENDPOINT}"
: "${AWS_ACCESS_KEY_ID:?已配置 AUDIO_S3_BUCKET 但缺少 AUDIO_S3_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?已配置 AUDIO_S3_BUCKET 但缺少 AUDIO_S3_SECRET_ACCESS_KEY}"

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# 新版 AWS CLI 默认附带 CRC 校验头，R2 不接受；只在服务端要求时才计算。
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

DEST="s3://${AUDIO_S3_BUCKET}/${AUDIO_S3_PREFIX:-audio}"
# 修复任务会用同名文件覆盖旧音频，所以不能标成 immutable；一小时后各端都会拿到新版。
COMMON=(--endpoint-url "$AUDIO_S3_ENDPOINT" --content-type audio/mpeg
  --cache-control "public, max-age=3600" --only-show-errors)

if [ "${1:-}" = "--all" ]; then
  aws s3 sync public/audio "$DEST" "${COMMON[@]}" --exclude "*" --include "*/full.mp3"
  echo "已同步全部音轨：$(find public/audio -mindepth 2 -maxdepth 2 -name full.mp3 | wc -l) 个 full.mp3"
  exit 0
fi

# 不带 --exclude-standard：音频被 .gitignore 忽略后仍要列出来。
mapfile -t files < <(git ls-files -m -o -- public/audio | grep '/full\.mp3$' | sort -u || true)
if [ "${#files[@]}" -eq 0 ]; then
  echo "本轮没有新的或改动的音轨"
  exit 0
fi
for file in "${files[@]}"; do
  unit="$(basename "$(dirname "$file")")"
  aws s3 cp "$file" "$DEST/$unit/full.mp3" "${COMMON[@]}"
  echo "上传 $unit"
done
echo "已上传 ${#files[@]} 条音轨"
