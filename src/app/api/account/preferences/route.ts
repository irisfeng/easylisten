import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { getDb } from "@/lib/db";

const MAX_PREFS_BYTES = 64 * 1024;

async function currentUserId() {
  const session = await auth();
  return session?.user?.id || null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const result = await getDb().execute({
    sql: "SELECT payload, revision, updated_at FROM user_preferences WHERE parent_user_id = ? LIMIT 1",
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) return NextResponse.json({ data: null, revision: 0 });

  try {
    return NextResponse.json({
      data: JSON.parse(String(row.payload)),
      revision: Number(row.revision),
      updatedAt: Number(row.updated_at),
    });
  } catch {
    return NextResponse.json({ data: null, revision: 0 });
  }
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = await request.json();
  const payload = JSON.stringify(body?.data ?? null);
  if (payload === "null" || Buffer.byteLength(payload, "utf8") > MAX_PREFS_BYTES) {
    return NextResponse.json({ message: "偏好数据无效或过大" }, { status: 400 });
  }

  const now = Date.now();
  await getDb().execute({
    sql: `INSERT INTO user_preferences (parent_user_id, payload, revision, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(parent_user_id) DO UPDATE SET
        payload = excluded.payload,
        revision = user_preferences.revision + 1,
        updated_at = excluded.updated_at`,
    args: [userId, payload, now],
  });
  return NextResponse.json({ ok: true });
}
