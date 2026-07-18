# 偏好云同步(匿名,无账号)

iOS Safari 会清掉**七天未访问**站点的 localStorage,用户的兴趣勾选、
收听进度、收藏会蒸发。`src/lib/sync.ts` 用"设备匿名 ID + Supabase"做
静默备份:偏好每次落盘后防抖上推;回访时若本地是白纸而云端有备份,
自动拉回。无登录、无注册、无个人信息。

代码已合入但**默认休眠**,按下面三步激活(约 3 分钟):

## 1. 建 Supabase 项目

[supabase.com](https://supabase.com) 注册(GitHub 登录即可)→ New project
(免费档,区域就近选新加坡)。

## 2. 建表与访问策略

项目内 **SQL Editor** → 粘贴运行:

```sql
create table if not exists public.prefs (
  device_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.prefs enable row level security;

create policy "anon_insert" on public.prefs
  for insert to anon with check (true);
create policy "anon_update" on public.prefs
  for update to anon using (true);
create policy "anon_select" on public.prefs
  for select to anon using (true);
```

> 安全边界:设备 ID 是不可猜测的随机 UUID,行内只有兴趣标签与收听
> 进度,无隐私敏感数据;anon key 按 Supabase 设计即公开凭据。

## 3. 配置 Vercel 环境变量

Supabase 项目 **Settings → API** 页复制两个值,填到
Vercel → easylisten → **Settings → Environment Variables**:

| 变量名 | 取值 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL(`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

保存后 **Redeploy** 一次(Deployments 页最新部署右侧 ⋯ → Redeploy),
构建时注入变量,同步即生效。不配置则一切如旧。
