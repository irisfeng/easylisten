# 轻听 iOS App 开发指南

iOS 壳基于 [Capacitor](https://capacitorjs.com):复用线上站点的全部界面与播放逻辑,
原生层只补 Web 给不了的能力——**锁屏/后台继续播放**(AVAudioSession +
UIBackgroundModes)。依赖用 Swift Package Manager,**不需要 CocoaPods**。

v1 采用**远程加载**模式(`capacitor.config.ts` 里 `server.url` 指向
easylisten.shddai.net,自有域名,国内可访问):App 打开即是最新内容,每日出刊无需发版。
离线包与原生锁屏控制条(MPRemoteCommandCenter)是后续演进方向。

## Mac 上首次跑起来

前置:macOS + App Store 安装 Xcode(首次打开会装 iOS 组件)。

```bash
git clone https://github.com/irisfeng/easylisten.git   # 已有则 git pull
cd easylisten
npm install
npm run build          # 产出 out/(sync 需要,远程模式下仅作占位)
npx cap sync ios       # 把 web 产物与配置同步进 iOS 工程
npx cap open ios       # 打开 Xcode
```

Xcode 里:

1. 左侧点根节点 **App** → TARGETS 选 **App** → **Signing & Capabilities**
2. 勾选 **Automatically manage signing**,**Team** 下拉选你的开发者团队
   (没有的话:Xcode → Settings → Accounts → 「+」登录 Apple ID)
3. Bundle Identifier 默认 `com.irisfeng.easylisten`,如报占用就改成
   自己的反域名(同时改根目录 `capacitor.config.ts` 的 `appId` 保持一致)
4. 顶部设备选一个模拟器(如 iPhone 16)→ **⌘R** 运行

真机调试:iPhone 连数据线(或同一 Wi-Fi 无线调试),设备列表选你的
iPhone → ⌘R;手机上首次要在 设置 → 通用 → VPN 与设备管理 里信任开发者证书。

## 验证后台播放

跑起来后播放任意一篇 → 锁屏/回主屏 → 声音应继续。若中断,检查:

- `ios/App/App/Info.plist` 是否含 `UIBackgroundModes: [audio]`
- `AppDelegate.swift` 是否设置了 `AVAudioSession`(playback + spokenAudio)

## 上 TestFlight(分发给自己和朋友)

1. Xcode 顶部设备选 **Any iOS Device (arm64)** → 菜单 **Product → Archive**
2. 弹出的 Organizer 里 **Distribute App → App Store Connect → Upload**,一路默认
3. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → 我的 App →
   「+」新建 App(名称:轻听;Bundle ID 选上一步用的;SKU 随意)
4. 构建处理完(约 10 分钟)后,在 **TestFlight** 标签页添加内部测试员
   (你的 Apple ID 邮箱),手机装 TestFlight App 即可安装

注意:中国大陆 App Store 正式上架需 ICP 备案,TestFlight 分发不需要,
早期用 TestFlight 即可(上限 1 万人,构建 90 天有效)。

## 日常迭代

- **网页/内容改动**:不需要动 App——远程模式下 App 打开即最新
- **原生层改动**(config、插件、图标):`npx cap sync ios` 后重新 ⌘R / Archive
- 图标改设计:改 `scripts/icons.mjs` 重跑,再把 `public/icons/icon-1024.png`
  覆盖到 `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
