# 安卓微信通知候选接入

本地 Expo 模块，只在 Android 原生构建中可用。网页、iPhone 和 Expo Go 会显示不支持，不尝试伪装接入。通过默认的 modules 目录自动发现，不手改生成的 mobile/android 工程。

## 数据与授权

- 默认停止，捕获开关仅存于原生进程内存，启动后最多 5 分钟，进程重启或到期停止，不自动续期。
- 系统通知使用权由用户手动授权，权限范围较广，包名过滤不等于系统只授权微信。
- 开始前在页面中明确同意持久化候选金额和时间。与 0.2 验证包不同，本版本将金额、时间、SHA-256 事件标识保存在应用私有本地队列中，停止不会删除已接收记录。
- 仅处理 com.tencent.mm 且标题严格为微信支付或 WeChat Pay 的非合并通知；不保存正文、联系人、商家、原始通知 key。原文仅在解析时短暂使用，不上传。
- 明确出现转账、红包、退款、收款成功、失败等内容时跳过。多个不同金额、格式歧义、外币内容跳过。
- 剩余事件仍只标为 needs_review，不证明支付成功或商家身份。标题可能被模仿，通知时间也未必等于真实付款时间。
- 未取得商家时使用微信付款候选作为占位，分类留空，只有用户核对后保存才计入统计。
- 原生队列最多 100 条，满后跳过并显示计数；去重标识最多 1000 个。无真实交易号时无法可靠跨渠道去重，同日同金额在账本中提示核对，不自动丢弃独立付款。
- 先将队列写入 JS 账本，再确认原生记录。确认失败重试用 captureId 去重，避免重复入账。用户删除后原生事件如果已确认则不会自动恢复。
- Android 13 提醒发送权限与通知读取权限分别申请。提醒不显示金额，点击进入待记账；拒绝发送提醒不影响候选入队。
- 应用安卓配置关闭自动备份，并阻止联网、录音与广泛存储权限。1.0.1 起提供可选悬浮分类窗口，SYSTEM_ALERT_WINDOW 必须由用户单独授权，应用内开关默认关闭。当前按离线 release 构建，无法依赖联网的 Metro 调试会话；正式发布前仍须检查最终合并 manifest 和 APK 权限。

## 构建与验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File F:\SavePiggy\mobile\build-android-local.ps1
```

Java 17、SDK、Gradle 缓存均使用 F 盘。Gradle 首次构建仍需下载 Android/Kotlin/React Native 依赖，必要时下载对应 SDK/NDK。生成的 APK 使用模板调试签名，仅供本地测试，不作为正式商店发布包。

测试包括 Java 原生解析用例、TypeScript 候选合并与重复确认用例、完整旧账单规则及网页打包。未完成 APK 构建和真机测试前，不能宣称正式自动记账已经可用。真实用户反馈目前仅证明在一台 S9 上某次付款的候选金额与实际一致，不代表所有微信付款可覆盖。

### 2026-11-04 构建结果

- Expo 58 推荐依赖补丁已对齐；lint、TypeScript 检查、22 项 JS 测试和 Java 解析测试通过。
- arm64-v8a release 测试 APK 完整编译成功，使用模板调试签名，APK Signature Scheme v2 校验通过。固定交付位置：`F:\SavePiggy\builds\SavePiggy-android-test-1.0.0.apk`。
- 成品包名 `cn.savepiggy.app`，最低 API 24；通知接入功能仅 Android API 28 及以上启用。通知监听服务由系统 BIND_NOTIFICATION_LISTENER_SERVICE 权限保护。
- 成品权限仅 VIBRATE、POST_NOTIFICATIONS 和应用内部签名级接收器权限；无 INTERNET、录音、悬浮窗或广泛存储权限，allowBackup=false，非 debuggable。
- PowerShell 中的 Gradle 属性参数须加引号，避免带点号的参数被拆开。`plugins/withShortCmakePaths.js` 通过 CNG 设置短编译缓存目录及 CMake 路径限制，解决 Windows Ninja 的 260 字符限制；不手工修改生成工程。
- 集成版尚待 vivo S9 安装、启动、通知授权、提醒跳转和真实付款测试。旧的独立 probe 验证结果不能代替集成版验收。

安装后从首页进入“微信付款候选接入”，先阅读本地保存说明，再自行决定授权和开启限时测试。无需特意付款；可在下一次正常消费时观察候选。核对金额、交易类型和是否重复，再选择分类保存。测试结束点击停止，并按需要关闭系统通知使用权。红包暂不支持。

### 1.0.1 悬浮分类窗口

用户要求付款后直接选择类别记账，因此新增 Android 原生 TYPE_APPLICATION_OVERLAY 窗口，不强行拉起 Activity。系统“显示在其他应用上层”权限和 App 内分类弹窗开关都启用后，才会在限时接入期间尝试显示。

- 窗口明确标识 SavePiggy，显示候选金额，提示核对真实消费和是否重复。点击类别即用户确认这笔支出，保存金额、时间、去重标识及所选分类到私有本地队列；下次 App 前台同步后进入合计，无需再次确认。
- 未点击类别不会自动入账。“稍后处理”、45 秒超时、停止接入或关闭弹窗功能都会关闭窗口，保留待记账。锁屏时不新建弹窗；权限被拒、系统阻止弹窗、已有窗口占用时回退到通知及待记账。
- 选择分类的记录先在原生队列持久保存，写入 JS 账本后才从队列移除。显示中的记录暂缓同步，避免先导入待记账后又生成重复账单；进程重启解除暂缓，未确认记录仍能恢复为待记账。
- 仍为 5 分钟测试模式，系统通知格式及 vivo 后台限制可能影响触发。未将红包、转账、退款当作支出；未使用无障碍点击或读取聊天内容。
- 版本号 1.0.1 / versionCode 2，同包名覆盖更新；请保留旧应用数据，勿为升级而卸载。
- 2026-11-04：完整 release 构建、签名校验、lint、类型检查、23 项 JS 测试通过。成品新增 SYSTEM_ALERT_WINDOW，仍无 INTERNET、录音及广泛存储权限；签名证书与 1.0.0 一致。测试包保存于 `F:\SavePiggy\builds\SavePiggy-android-test-1.0.1.apk`，已复制到已连接手机的 Download 文件夹；未代替用户安装或开启权限，悬浮窗口触发与点击仍待 vivo 真机验收。

参考：[Android 悬浮窗口类型](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#TYPE_APPLICATION_OVERLAY)、[悬浮窗授权设置](https://developer.android.com/reference/android/provider/Settings#ACTION_MANAGE_OVERLAY_PERMISSION)。

### 1.0.2 后台显示诊断

用户在 vivo S9 反馈：系统悬浮窗授权及后台弹出界面均允许，仍只有返回 App 才弹窗。之前 ADB 仅确认 SYSTEM_ALERT_WINDOW app-op 为 allow、通知监听服务已绑定；这些证据不能证明后台窗口可见，也不能证明付款时通知已经送达。根因尚未确认。

- 新增“8 秒后显示测试弹窗（不入账）”，用同一个原生窗口实现测试。不依赖支付通知或启动监听测试；显示明确的演示标识，点击类别只关闭演示，不读写账单和原生付款队列。
- 用户点击测试后立即返回桌面并保持解锁。若桌面可显示，再到微信普通页面重复测试，可区分全局后台问题与特定页面隐藏悬浮窗。无需真实付款。
- 增加本次进程的监听连接状态、支付标题通知回调时间、候选解析时间、窗口尝试时间和结果。收到时的前后台标记来自应用进程 importance，属于辅助线索，不能单独证明某个 Activity 当时可见。
- 诊断字段只在内存中，进程重启即重置；SavePiggyCapture 系统日志仅记录固定的状态码和本应用进程状态，不记录通知原文、金额、联系人、交易标识或类别。Android logcat 自身带有日志时间。
- `addView` 成功仅标为“窗口已提交系统显示”，不能据此宣称窗口实际可见。系统拒绝时保留异常类名，不输出可能含敏感内容的异常 message。
- 通知监听只能在系统发布通知后收到回调。如果源 App 在前台没有及时发布支付通知，监听方案无法凭空提前取得金额；必须以新的时序证据判断，不能继续仅要求用户放宽权限。
- 2026-11-04：1.0.2 / versionCode 3 完整 Android release 构建、23 项 JS 测试、lint 和类型检查通过。成品签名验证通过且证书与 1.0.1 一致，未增加权限。APK 已保存到 `F:\SavePiggy\builds\SavePiggy-android-test-1.0.2.apk` 并复制至手机 Download 文件夹，等待用户覆盖安装及桌面演示测试；后台问题尚未宣称修复。

参考：[Android 通知监听回调](https://developer.android.com/reference/android/service/notification/NotificationListenerService#onNotificationPosted(android.service.notification.StatusBarNotification))。
