# 音频存储：对象存储，不进 git

## 为什么

到 2026-10 为止，`public/audio` 下有约 1.3 万个 MP3、共 1.4 GB，占了仓库的几乎全部体积，
并且每天出刊都在增长。git 会永久保留提交过的每个文件，克隆、CI 检出和部署都要为此付费。

其中一半是多余的：播放器只读取每条音轨的 `full.mp3`（约 600 个、680 MB）；逐句的
`<句序>.mp3`（约 1.24 万个、690 MB）只是拼接 `full.mp3` 的中间产物，manifest 里每条音轨
都已有时间轴，没有任何页面再请求它们。

## 现在的结构

- **对象存储（Cloudflare R2）** 保存 `audio/<音轨>/full.mp3`，经自定义域名公开访问。
- **git** 只保存 `public/audio/manifest.json`（音轨清单、时间轴、音色记录）。
- **站点** 通过 `NEXT_PUBLIC_AUDIO_BASE_URL` 拼出音频地址（`src/lib/audio-url.ts`）；
  未设置时回落到站内 `/audio`。
- **出刊工作流** 在 Actions 工作区里合成并拼接音频，先用 `scripts/upload-audio.sh`
  上传 `full.mp3`，再提交 manifest。上传失败就不提交，manifest 不会指向不存在的音频。

选 R2 的原因：域名已经在 Cloudflare 上；R2 不收流量费；自定义域名自带 CDN 缓存。
上传走 S3 兼容接口，换成阿里云 OSS 或腾讯云 COS 只需要改变量，不改代码。

## 一次性配置（只有仓库所有者能做）

1. 在 Cloudflare 创建 R2 存储桶，例如 `easylisten-audio`。
2. 给存储桶绑定自定义域名，例如 `audio.shddai.net`。不要用 `r2.dev` 地址，它有限速且不走缓存。
3. 创建 R2 API 令牌，权限为该存储桶的"对象读写"，记下 Access Key ID、Secret Access Key
   和 S3 端点（`https://<账户 ID>.r2.cloudflarestorage.com`）。
4. 在 GitHub 仓库的 Settings → Secrets and variables → Actions 里添加：

   | 类型 | 名称 | 值 |
   |---|---|---|
   | Variable | `AUDIO_S3_BUCKET` | `easylisten-audio` |
   | Variable | `AUDIO_S3_ENDPOINT` | `https://<账户 ID>.r2.cloudflarestorage.com` |
   | Variable | `AUDIO_PUBLIC_BASE_URL` | `https://audio.shddai.net/audio` |
   | Secret | `AUDIO_S3_ACCESS_KEY_ID` | 令牌的 Access Key ID |
   | Secret | `AUDIO_S3_SECRET_ACCESS_KEY` | 令牌的 Secret Access Key |

   变量一旦配置，每天的出刊就开始同时写入对象存储和仓库（双写）。

## 迁移顺序

每一步都可以单独回退，顺序不能颠倒。

1. **回填**：手动运行 Actions 里的「回填音频到对象存储」。它上传仓库里全部 `full.mp3`，
   再逐条核对 manifest 里的每条音轨都能从 `AUDIO_PUBLIC_BASE_URL` 取到。必须是绿色。
2. **切换站点**：在 Vercel 的环境变量里设置
   `NEXT_PUBLIC_AUDIO_BASE_URL=https://audio.shddai.net/audio` 并重新部署。
   在手机 Safari、微信内和锁屏状态下各听一篇，确认播放、点句和高亮正常。
   回退：删掉这个变量并重新部署，站点回到读取仓库里的音频。
3. **移出仓库**：合并 `audio-cutover` 分支。它把 `public/audio/**/*.mp3` 加入 `.gitignore`
   并从 git 索引里删除全部 MP3。此后每日提交只包含 manifest 和听稿 JSON。
   如果第 2 步的变量没设，`npm run build` 会被 `scripts/check-audio-source.mjs` 拦下，
   线上保留上一个可用版本。
4. **（可选）瘦身历史**：第 3 步之后仓库不再增长，但历史里仍有 1.4 GB。Vercel 和 Actions
   都是浅克隆，不受影响；只有完整克隆慢。要彻底瘦身需要改写历史并强制推送：

   ```bash
   git filter-repo --path-glob 'public/audio/*/*.mp3' --invert-paths
   git push --force origin main
   ```

   这会改掉所有提交的哈希，本地其他克隆都要重新克隆，做之前先确认没有未合并的分支。

## 日常操作

- **本地开发**：在 `.env.local` 里设置同一个 `NEXT_PUBLIC_AUDIO_BASE_URL`，直接播放线上音频。
- **核对线上音频**：`AUDIO_PUBLIC_BASE_URL=https://audio.shddai.net/audio node scripts/verify-audio.mjs`
- **重做某篇音频**：运行「已审核稿件音频修复」并勾选 `force_regenerate`。新文件用同名覆盖，
  缓存一小时内过期。

## 与旧行为的差别

- 往期音轨的逐句文件不再保留，所以"只重合成受新朗读规则影响的那几句"只对本轮在工作区里
  生成的音轨有效；往期音轨要更新只能整轨强制重做。
- 已发布的稿件如果改了正文导致句数变化，出刊闸门会报"正文句数已变而工作区没有旧音轨"，
  同样需要整轨强制重做。
- 将来再升级 `FULL_AUDIO_VERSION` 时，往期音轨无法在工作区里重新拼接，需要另写迁移。
