# 家长账号与偏好同步

轻听使用独立的家长账号体系：邮箱一次性验证码登录、Turso 存储账号与偏好、
Resend 发送邮件。没有复制其他项目的数据库或代码，也不要求孩子建立账号。

## 1. 新建轻听专属 Turso 数据库

```bash
turso auth login
turso db create easylisten-prod
turso db show --url easylisten-prod
turso db tokens create easylisten-prod
```

把后两个命令返回的 URL 和 token 写入本地 `.env.local` 及 Vercel 环境变量，随后运行：

```bash
npm run db:migrate
```

迁移只创建 `parent_users`、`login_codes`、`listener_profiles` 和
`user_preferences` 四张轻听专属表。

## 2. 配置邮件和 Auth.js

| 变量 | 用途 |
|---|---|
| `TURSO_DATABASE_URL` | 新 Turso 数据库 URL |
| `TURSO_AUTH_TOKEN` | 新数据库 token，只放服务端 |
| `AUTH_SECRET` | 登录码散列与会话签名随机密钥 |
| `RESEND_API_KEY` | Resend 服务端 API key |
| `AUTH_EMAIL_FROM` | 已验证域名的发件人，例如 `轻听 <login@example.com>` |

Resend 上线前应完成发信子域名的 SPF、DKIM 验证，建议同时配置 DMARC，并实测
QQ、163、126 等国内常用邮箱的收件与垃圾箱表现。登录码 10 分钟过期、60 秒内不能
重发，单邮箱每小时最多 5 次、单 IP 每小时最多 20 次，连续输错 5 次后失效。

参考：[Turso Next.js 指南](https://docs.turso.tech/sdk/ts/guides/nextjs)、
[Resend 域名验证](https://resend.com/docs/dashboard/domains/introduction)、
[Resend 投递质量](https://resend.com/docs/dashboard/emails/deliverability-insights)。

## 3. 数据边界

- 首次验证码验证即自助创建家长账号，不采用企业预置白名单。
- 只记录孩子所处年龄段：6–9、10–12、13–16，不收集姓名、学校、生日。
- 未登录仍可试听；登录后才把本地偏好与进度同步到家长账号。
- 如果将来确需收集儿童个人信息，必须另做监护人明示同意与删除机制。
