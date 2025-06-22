import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const reqUrl = req.nextUrl;

  console.log(`[Middleware] Path: ${reqUrl.pathname}, Is Logged In: ${isLoggedIn}`);

  const isSignInPage = reqUrl.pathname === '/sign-in';

  // 如果用户未登录，并且访问的不是登录页面，则重定向到登录页
  if (!isLoggedIn && !isSignInPage) {
    console.log(`[Middleware] Redirecting unauthenticated user from ${reqUrl.pathname} to /sign-in`);
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  // 如果用户已登录，并且试图访问登录页面，则重定向到首页
  if (isLoggedIn && isSignInPage) {
    console.log(`[Middleware] Redirecting authenticated user from /sign-in to /`);
    return NextResponse.redirect(new URL('/', req.url));
  }
  
  // 允许其他所有请求通过
  return NextResponse.next();
});

export const config = {
  // 将中间件应用于所有路径，除了API、Next.js内部静态文件和图片资源
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}; 