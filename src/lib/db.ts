import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

/**
 * Turso 连接只在服务端请求真正使用时创建，避免未配置环境变量时阻断静态构建。
 * 轻听使用独立数据库，不接受浏览器直连，也不暴露数据库 token。
 */
export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("轻听账号服务尚未配置 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  }

  client = createClient({ url, authToken });
  return client;
}
