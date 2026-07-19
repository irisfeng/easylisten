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
          登录不是收听门槛。它只负责把年龄段、兴趣、收藏和收听进度同步到你的其他设备。
        </p>
        <div className="mt-5 rounded-2xl bg-surface-strong px-5 py-4 text-sm leading-7 text-ink-soft">
          <p>不登录也可以完整看、完整听，偏好会保存在这台设备上。</p>
          <Link href="/" className="mt-1 inline-flex min-h-10 items-center font-medium text-accent hover:underline">
            暂不登录，继续收听
          </Link>
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-[0_16px_44px_rgba(27,48,38,0.06)] sm:p-6">
          <Suspense fallback={<p className="text-sm text-ink-soft">正在准备安全登录…</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-xs leading-6 text-ink-faint">
          邮箱只用于验证码登录，不订阅营销邮件，也不要求填写孩子姓名、学校或生日。
        </p>
      </section>
    </main>
  );
}
