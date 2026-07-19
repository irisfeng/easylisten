"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  async function requestCode() {
    if (!email.trim()) {
      setMessage("请先输入邮箱");
      return;
    }
    if (!acceptedTerms) {
      setMessage("请先同意用户协议与隐私说明");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, acceptedTerms }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "发送失败");
      setSent(true);
      setRemaining(60);
      setMessage("验证码已发送，请检查收件箱和垃圾邮件");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setMessage("请输入 6 位数字验证码");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await signIn("email-code", {
      email,
      code,
      redirect: false,
    });
    setBusy(false);
    if (result?.error) {
      setMessage("验证码无效、已过期或尝试次数过多");
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm text-ink-soft">家长邮箱</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          placeholder="name@example.com"
          className="min-h-12 w-full rounded-xl border border-line bg-paper px-4 text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-ink-soft">验证码</span>
        <div className="flex gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="6 位数字"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-paper px-4 font-mono tracking-[0.18em] text-ink outline-none transition placeholder:tracking-normal placeholder:text-ink-faint focus:border-accent"
          />
          <button
            type="button"
            onClick={requestCode}
            disabled={busy || remaining > 0}
            className="min-h-12 shrink-0 rounded-full border border-line px-4 text-sm text-ink-soft transition hover:border-accent hover:text-ink active:scale-[0.98] disabled:opacity-45"
          >
            {remaining > 0 ? `${remaining}s` : sent ? "重新发送" : "发送验证码"}
          </button>
        </div>
      </label>

      <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        />
        <span>我已阅读并同意用户协议与隐私说明。首次验证会创建家长账号；轻听不要求填写孩子姓名、学校或生日。</span>
      </label>

      {message && <p aria-live="polite" className="text-sm leading-relaxed text-ink-soft">{message}</p>}

      <button
        type="submit"
        disabled={busy || !sent}
        className="min-h-12 w-full rounded-full bg-ink px-5 text-sm font-medium text-surface transition active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? "请稍候…" : "登录轻听"}
      </button>
    </form>
  );
}

function safeCallbackUrl(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
