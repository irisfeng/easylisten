import type { CapacitorConfig } from "@capacitor/cli";

/**
 * iOS 壳的配置。v1 采用"远程加载"模式:App 直接加载线上站点,
 * 内容随每日出刊即时更新,无需发版;离线包模式(webDir)留作后续演进。
 * appId 需与 Apple Developer 账户里的 Bundle ID 一致,改这里一处即可。
 */
const config: CapacitorConfig = {
  appId: "com.irisfeng.easylisten",
  appName: "轻听",
  webDir: "out",
  server: {
    // 自有域名经 Cloudflare 解析,国内可访问;vercel.app 在国内被墙
    url: "https://easylisten.shddai.net",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#f7f6f3",
  },
};

export default config;
