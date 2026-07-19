import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { AccountSettings } from "./AccountSettings";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account");

  return (
    <main className="mx-auto min-h-[100dvh] max-w-xl px-5 py-5 sm:px-6 sm:py-8">
      <nav className="flex min-h-14 items-center justify-between border-b border-line" aria-label="账号页导航">
        <Link href="/" className="flex items-baseline gap-2 text-ink">
          <span className="font-serif text-xl tracking-tight">轻听</span>
          <span className="text-xs text-ink-faint">EasyListen</span>
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-ink-soft hover:bg-ink/[0.04] hover:text-ink">
          返回首页
        </Link>
      </nav>
      <section className="pt-10 sm:pt-14">
        <h1 className="font-serif text-[2.6rem] leading-tight tracking-[-0.03em]">我的轻听</h1>
        <p className="mt-3 leading-7 text-ink-soft">免登录也能完整收听；账号只用于跨设备保存必要的家庭偏好。</p>
        <AccountSettings email={session.user.email ?? ""} />
      </section>
    </main>
  );
}
