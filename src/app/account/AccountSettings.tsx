"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

const bands = [
  { value: "6-9", label: "6-9 岁", detail: "小学低年级" },
  { value: "10-12", label: "10-12 岁", detail: "小学高年级" },
  { value: "13-16", label: "13-16 岁", detail: "初中阶段" },
];

export function AccountSettings({ email }: { email: string }) {
  const [ageBand, setAgeBand] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/account/profile")
      .then((response) => response.json())
      .then((data) => setAgeBand(data.ageBand ?? ""))
      .catch(() => {});
  }, []);

  async function save(value: string) {
    setAgeBand(value);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ageBand: value }),
      });
      if (!response.ok) throw new Error("保存失败");
      setMessage("年龄段已保存。当前日刊仍由编辑部统一精选；后续分龄排序会参考这一设置。");
    } catch {
      setMessage("暂时没有保存成功，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-9 space-y-8">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_14px_36px_rgba(27,48,38,0.05)]">
        <p className="text-sm text-ink-soft">家长账号</p>
        <p className="mt-2 text-ink">{email}</p>
      </section>

      <section>
        <h2 className="font-serif text-2xl tracking-tight">主要收听年龄段</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">只记录年龄段，不收集孩子姓名、学校和生日。</p>
        <div className="mt-4 grid gap-3">
          {bands.map((band) => (
            <button
              key={band.value}
              type="button"
              disabled={busy}
              onClick={() => save(band.value)}
              className={`flex min-h-16 items-center justify-between rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                ageBand === band.value ? "border-accent bg-accent text-paper" : "border-line bg-surface hover:border-accent"
              }`}
            >
              <span className="font-medium">{band.label}</span>
              <span className={ageBand === band.value ? "text-paper/75" : "text-ink-soft"}>{band.detail}</span>
            </button>
          ))}
        </div>
        {message && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{message}</p>}
      </section>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="min-h-11 rounded-full border border-line px-4 text-sm text-ink-soft transition hover:border-accent hover:text-ink active:scale-[0.98]"
      >
        退出登录
      </button>
    </div>
  );
}
