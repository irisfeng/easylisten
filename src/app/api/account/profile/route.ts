import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { getDb } from "@/lib/db";
import { isAgeBand } from "@/lib/account-store";

async function currentUserId() {
  const session = await auth();
  return session?.user?.id || null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ authenticated: false, ageBand: null });

  const result = await getDb().execute({
    sql: "SELECT age_band FROM listener_profiles WHERE parent_user_id = ? LIMIT 1",
    args: [userId],
  });
  return NextResponse.json({ authenticated: true, ageBand: result.rows[0]?.age_band ?? null });
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = await request.json();
  if (!isAgeBand(body?.ageBand)) {
    return NextResponse.json({ message: "请选择有效的年龄段" }, { status: 400 });
  }

  const now = Date.now();
  await getDb().execute({
    sql: `INSERT INTO listener_profiles (id, parent_user_id, age_band, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(parent_user_id) DO UPDATE SET age_band = excluded.age_band, updated_at = excluded.updated_at`,
    args: [crypto.randomUUID(), userId, body.ageBand, now, now],
  });
  return NextResponse.json({ ok: true, ageBand: body.ageBand });
}
