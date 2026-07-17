import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "轻听 · EasyListen",
  description:
    "眼睛太忙了,把阅读交给耳朵。每天几篇,宁缺毋滥——一个可以听的阅读空间。",
  openGraph: {
    title: "轻听 · EasyListen",
    description: "眼睛太忙了,把阅读交给耳朵。每天几篇,宁缺毋滥。",
    url: "https://easylisten.shddai.net",
    siteName: "轻听",
    locale: "zh_CN",
    type: "website",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "轻听",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={newsreader.variable}>
      <body>{children}</body>
    </html>
  );
}
