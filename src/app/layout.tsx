import type { Metadata } from "next";
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
    "从科学到新闻,从深度长文到流行文化——一个可以听的阅读空间。极简的界面,顺手的操作。",
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
