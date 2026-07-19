import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  throw new Error("请先配置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN");
}

const sql = readFileSync(
  resolve(import.meta.dirname, "../db/migrations/001_parent_accounts.sql"),
  "utf8",
);
const statements = sql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const db = createClient({ url, authToken });
for (const statement of statements) await db.execute(statement);
console.log(`迁移完成：${statements.length} 条语句`);
