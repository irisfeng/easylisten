import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import {
  generateLoginCode,
  hashLoginCode,
  hashRateLimitKey,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_RESEND_MS,
  LOGIN_CODE_TTL_MS,
  normalizeEmail,
  normalizeLoginCode,
  safeHashEqual,
} from "./login-code";
import { sendLoginCodeEmail } from "./login-email";

export const AGE_BANDS = ["6-9", "10-12", "13-16"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const CONSENT_VERSION = "2026-07-19";

type LoginCodeRow = {
  id: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  is_signup: number;
};

export class AccountError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function requestLoginCode({
  rawEmail,
  acceptedTerms,
  clientIp,
}: {
  rawEmail: unknown;
  acceptedTerms: boolean;
  clientIp: string;
}) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AccountError("INVALID_EMAIL", "请输入有效的邮箱地址");

  const db = getDb();
  const now = Date.now();
  const existing = await db.execute({
    sql: "SELECT id FROM parent_users WHERE email = ? AND status = 'active' LIMIT 1",
    args: [email],
  });
  const isSignup = existing.rows.length === 0;
  if (!acceptedTerms) {
    throw new AccountError("CONSENT_REQUIRED", "请先同意用户协议与隐私说明");
  }

  const recent = await db.execute({
    sql: "SELECT created_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    args: [email],
  });
  const lastCreatedAt = Number(recent.rows[0]?.created_at ?? 0);
  if (lastCreatedAt && now - lastCreatedAt < LOGIN_CODE_RESEND_MS) {
    throw new AccountError("TOO_SOON", "验证码已发送，请稍后再试", 429);
  }

  const hourAgo = now - 60 * 60 * 1000;
  const ipHash = hashRateLimitKey(clientIp || "unknown");
  const counts = await db.execute({
    sql: `SELECT
      SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS email_count,
      SUM(CASE WHEN request_ip_hash = ? THEN 1 ELSE 0 END) AS ip_count
      FROM login_codes WHERE created_at >= ?`,
    args: [email, ipHash, hourAgo],
  });
  if (Number(counts.rows[0]?.email_count ?? 0) >= 5) {
    throw new AccountError("EMAIL_RATE_LIMIT", "该邮箱请求过于频繁，请一小时后再试", 429);
  }
  if (Number(counts.rows[0]?.ip_count ?? 0) >= 20) {
    throw new AccountError("IP_RATE_LIMIT", "请求过于频繁，请稍后再试", 429);
  }

  const id = randomUUID();
  const code = generateLoginCode();
  await db.execute({
    sql: `INSERT INTO login_codes
      (id, email, code_hash, expires_at, attempts, consumed_at, is_signup, consent_version, request_ip_hash, created_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
    args: [
      id,
      email,
      hashLoginCode(email, code),
      now + LOGIN_CODE_TTL_MS,
      isSignup ? 1 : 0,
      isSignup ? CONSENT_VERSION : null,
      ipHash,
      now,
    ],
  });

  try {
    await sendLoginCodeEmail({ email, code, requestId: id });
  } catch (error) {
    await db.execute({ sql: "DELETE FROM login_codes WHERE id = ?", args: [id] });
    throw error;
  }

  return { email, isSignup };
}

export async function verifyLoginCode(rawEmail: unknown, rawCode: unknown) {
  const email = normalizeEmail(rawEmail);
  const code = normalizeLoginCode(rawCode);
  if (!email || !code) return null;

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, code_hash, expires_at, attempts, is_signup
      FROM login_codes
      WHERE email = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    args: [email],
  });
  const row = result.rows[0] as unknown as LoginCodeRow | undefined;
  if (!row || Number(row.expires_at) < Date.now()) return null;
  if (Number(row.attempts) >= LOGIN_CODE_MAX_ATTEMPTS) return null;

  const actualHash = hashLoginCode(email, code);
  if (!safeHashEqual(actualHash, String(row.code_hash))) {
    await db.execute({
      sql: "UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?",
      args: [row.id],
    });
    return null;
  }

  const now = Date.now();
  const consumed = await db.execute({
    sql: `UPDATE login_codes SET consumed_at = ?
      WHERE id = ? AND consumed_at IS NULL
      RETURNING id`,
    args: [now, row.id],
  });
  if (consumed.rows.length === 0) return null;

  const newUserId = randomUUID();
  await db.execute({
    sql: `INSERT INTO parent_users
      (id, email, status, consent_version, consented_at, created_at, updated_at, last_login_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at, last_login_at = excluded.last_login_at`,
    args: [
      newUserId,
      email,
      Number(row.is_signup) ? CONSENT_VERSION : null,
      Number(row.is_signup) ? now : null,
      now,
      now,
      now,
    ],
  });

  const user = await db.execute({
    sql: "SELECT id, email FROM parent_users WHERE email = ? AND status = 'active' LIMIT 1",
    args: [email],
  });
  if (!user.rows[0]) return null;
  return { id: String(user.rows[0].id), email: String(user.rows[0].email) };
}

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === "string" && AGE_BANDS.includes(value as AgeBand);
}
