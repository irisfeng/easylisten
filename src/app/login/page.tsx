import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg px-5 py-5 sm:px-6 sm:py-8">
      <nav className="flex min-h-14 items-center justify-between border-b border-line" aria-label="登录页导航">
        <Link href="/" className="flex items-baseline gap-2 text-ink">
          <span className="font-serif text-xl tracking-tight">轻听</span>
          <span className="text-xs text-ink-faint">EasyListen</span>
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-ink-soft hover:bg-ink/[0.04] hover:text-ink">
          返回首页
        </Link>
      </nav>

      <section className="pt-10 sm:pt-14">
        <h1 className="font-serif text-[2.6rem] leading-tight tracking-[-0.03em]">家长登录</h1>
        <p className="mt-3 max-w-md leading-7 text-ink-soft">
          用邮箱验证码登录。收藏、兴趣和收听进度会跟随账号，孩子只需选择年龄段。
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-[0_16px_44px_rgba(27,48,38,0.06)] sm:p-6">
          <Suspense fallback={<p className="text-sm text-ink-soft">正在准备安全登录…</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-xs leading-6 text-ink-faint">
          内测阶段先使用邮箱。正式开放前会完成 QQ、163、126 等国内常用邮箱的送达测试。
        </p>
      </section>
    </main>
  );
}
