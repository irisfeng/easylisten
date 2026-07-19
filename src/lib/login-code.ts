import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_CODE_RESEND_MS = 60 * 1000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeLoginCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("轻听账号服务尚未配置 AUTH_SECRET");
  return value;
}

export function hashLoginCode(email: string, code: string): string {
  return createHmac("sha256", secret()).update(`${email}:${code}`).digest("hex");
}

export function hashRateLimitKey(value: string): string {
  return createHmac("sha256", secret()).update(`rate:${value}`).digest("hex");
}

export function safeHashEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
