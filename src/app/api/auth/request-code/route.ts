import { NextResponse } from "next/server";
import { AccountError, requestLoginCode } from "@/lib/account-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const clientIp = forwarded.split(",")[0]?.trim() || "unknown";
    await requestLoginCode({
      rawEmail: body?.email,
      acceptedTerms: body?.acceptedTerms === true,
      clientIp,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("request login code failed", error);
    return NextResponse.json(
      { ok: false, code: "SERVICE_UNAVAILABLE", message: "验证码暂时无法发送，请稍后再试" },
      { status: 503 },
    );
  }
}
