# 影视播放内核（第二路增强核）

> 状态：**影视域协议与 E 阶段已收口**；桌面 E2.1–E2.5；Android E2.A–E2.G；**E-RIFE.0–5 实时补帧（RIFE）代码已接**（需本机 VS/模型或增强 AAR）  
> 选型：`docs/bugs.txt` L31–33 + 规划 Q1–Q15  
> 许可定调：[VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md)（目标 **GPL-3.0-or-later**；根 `LICENSE` / `package.json` 已换证）  
> 番剧：[VIDEO_BANGUMI_KAZUMI.md](./VIDEO_BANGUMI_KAZUMI.md)  
> 排期：[VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md)  
> 与小喵 / Anime4K 上游差异与补强：[VIDEO_ANIME4K_MPV_ANDROID_GAP.md](./VIDEO_ANIME4K_MPV_ANDROID_GAP.md)  
> 实时补帧：[VIDEO_RIFE.md](./VIDEO_RIFE.md)

对标体验参考（只读，非直接依赖）：

| 参考仓 | 用途 |
|--------|------|
| `VideoPlayer/mpv-android-anime4k-master` | Anime4K、弹幕、独立播放体验 |
| `VideoPlayer/mpvRx-master` | HDR/超分壳、缩略图（后置） |
| `VideoPlayer/mpvEx-master` / `mpvKt-main` | 手势、网盘 UX |
| `VideoPlayer/DanDanPlayForAndroid-master` | 弹幕匹配、多内核切换 |
| `VideoPlayer/Kazumi-main` | 独立番剧规则与 UI（E6） |
| `VideoPlayer/nextplayer-main` / `only_player-main` | Media3 UX（Android） |
| `VideoPlayer/Anime4K-master` | GLSL 资源 |
| `VideoPlayer/DanmakuFlameMaster-master` | Android 弹幕渲染 |
| `VideoPlayer/Bilibili-Evolved-master` | B 站弹幕下载并发策略 |

---

## 1. 多核选型

| 引擎 | 平台 | 角色 |
|------|------|------|
| **artplayer** | 全端（WebView/`<video>` + MSE） | **主路**：Hub 在线 HLS/FLV/DASH |
| **libmpv** | 桌面独立窗；Android Activity | **增强核**：本地/ASS/硬解/Anime4K/HDR/**RIFE 补帧** |
| **media3** | **仅 Android** | **可选核**：补齐 TVBox/Exo 习惯能力 |
| **external** | 桌面 shell | **第三路**：系统 `mpv`/`vlc`/`system`；参数深度交接 |

**不做**：主 WebView 挖洞嵌 mpv；把 libmpv 帧回灌 Artplayer / Canvas；桌面 Media3；再引入 IJK；Cast/Syncplay；专有 P2P so；完整 Cling；Widevine L1；应用内 BT（延期）。

### 1.0 默认轻量（Artplayer-only）vs 增强构建

**默认产品形态为 lite**：`pnpm tauri dev|build|android …` 以 Artplayer 为主路、**保留外置播放器**、不打包桌面 libmpv 资源、Android 不编 AAR；隐藏内嵌 libmpv / Media3 / Anime4K·RIFE 入口。`media-ffmpeg` / `video-libmpv` Cargo feature 仍默认关闭。

| 项 | 默认 / lite | enhanced（opt-in） |
|----|-------------|-------------------|
| 脚本 | `pnpm tauri …`（经 `scripts/tauri-cli.mjs`，默认 lite） | `pnpm tauri … enhanced` 或 `tauri:dev:enhanced` / `:libmpv` |
| 环境 | `VITE_VIDEO_PROFILE=artplayer-only`（vite 缺省亦同） | `VITE_VIDEO_PROFILE=enhanced` · `READER_VIDEO_ENHANCED=1` |
| Cargo features | **不传** | `--features video-libmpv` |
| 前端路由 | Artplayer + **external**；`libmpv`/`media3` 压成 artplayer；设置可配外置 | 按 prefs 路由；本地默认 `libmpv` |
| 桌面 bundle | `tauri.conf.json` 不含 `resources/libmpv/*` | `--config src-tauri/tauri.enhanced.conf.json` 含 libmpv |
| Android AAR / Media3 | 默认跳过 `mpvAvailable` **与** `androidx.media3` | 有 AAR 则编入；打包 Media3 |

Android lite **不打包 Media3**、不显示回退开关；增强构建（`READER_VIDEO_ENHANCED=1`）才引入 `androidx.media3` 并允许 Artplayer→Media3 回退。Media3 为随 APK 引入的 **AndroidX Media3 / ExoPlayer**（Apache-2.0），**不是**系统内置播放器，也与桌面 `ffmpeg-next` / `libmpv` 无关。

### 1.1 Rust 绑定定稿

| 项 | 定稿 |
|----|------|
| Feature 名 | `video-libmpv`（保留） |
| 依赖 | **`libmpv2` + `libmpv2-sys`**（[crates.io/libmpv2](https://crates.io/crates/libmpv2)，维护线 kohsine/libmpv-rs） |
| **禁用** | [ParadoxSpiral/libmpv-rs](https://github.com/ParadoxSpiral/libmpv-rs)（约 2020 停更，勿再引入） |
| 不选 | `mpv-client-cross`（偏 mpv **插件** API，非 App 内嵌主路径） |
| 备选 | 若 libmpv2 联调失败，再评估仓内 bindgen 薄层（不进首版依赖） |
| Cargo | `video-libmpv = ["dep:libmpv2"]`（已落地） |

### 1.2 渲染策略

- **MpvEnhance**：独立播放窗 / Android Activity 上的 **原生 VO**（OpenGL/Vulkan/平台窗句柄交给 mpv）。该路径**不做**把 libmpv 帧经 IPC 灌进前端 `<canvas>`。  
- **Web / Rust 增强**：另见 [VIDEO_WEB_ENHANCE.md](./VIDEO_WEB_ENHANCE.md)——WebCodecs + canvas 自管呈现、Rust demux HTTP、Rust native 独立窗；与 MpvEnhance **四路并存**，非帧回灌。  
- **暂不做**：主壳 WebView 挖洞嵌 mpv Surface。

---

## 2. 路由规则（PlaybackRouter）

实现路径：`src/lib/media/video/playback/`

```
来源 / 用户强制
  ├─ **默认 lite**：允许 artplayer / external；`libmpv` / `media3` → artplayer
  ├─ 增强构建下：用户强制 external / libmpv / artplayer / media3 → 对应引擎
  ├─ file:// / 本地库 / WebDAV → **设置「本地播放方式」**（lite 默认 artplayer；enhanced 默认 libmpv）
  ├─ 嗅探直链（默认）→ external
  └─ Hub / 番剧在线直链（默认） → artplayer
       └─ Android 增强构建上 Artplayer 失败且开启「失败切 Media3」→ media3
```

**说明**：仅配置「外置播放器种类」（mpv/vlc/自定义）**不会**改写搜索/直播主路；外置可播 `http(s)` URL。要默认走外置，请将「强制播放引擎」设为 `external`，或在点播页点「外置」。Anime4K / 多音轨 ASS 精细控制：**仅 libmpv**（及外置 mpv 的 shaders/参数子集）。

---

## 3. PlaybackEngine 协议（冻结）

```ts
type PlaybackEngineId = 'artplayer' | 'libmpv' | 'media3' | 'external';

interface PlaybackLoadOptions {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  startSec?: number;
  subtitle?: string;
  audioTrack?: string | number;
  anime4k?: { mode: 'off' | 'A' | 'B' | 'C' | 'AA' | 'BB' | 'CA'; quality?: 'fast' | 'balanced' | 'high' };
}

interface PlaybackEngine {
  readonly id: PlaybackEngineId;
  load(opts: PlaybackLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(sec: number): Promise<void>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number>;
  listAudioTracks(): Promise<{ id: string; label: string }[]>;
  listSubtitleTracks(): Promise<{ id: string; label: string }[]>;
  setAudioTrack(id: string): Promise<void>;
  setSubtitleTrack(id: string | 'no'): Promise<void>;
  destroy(): Promise<void>;
}
```

进度：`video_play_record`（及番剧侧历史，见 BANGUMI 文档）。

### 3.1 外置 IPC 契约（E1）✅

- 启动：`mpv --input-ipc-server=<pipe|socket> [args...] -- <url>`
- **必须参数**（有则传）：`--sub-file=`、`--aid=`、`--start=`、`--glsl-shaders=`、`--force-media-title=`
- **尽力**：`video_mpv_ipc_get_time_pos`（可返回 `null`）
- **不做**：`--wid` 嵌入主壳
- 实现：`external-player.ts`、`playback/external-mpv.ts`、`playback/anime4k.ts`

### 3.2 桌面 libmpv 窗

| 子阶段 | 内容 | 状态 |
|--------|------|------|
| **E2** | `video_libmpv_open_window` / `video_libmpv_status`；feature 闸门；前端「增强」降级提示 | ✅ |
| **E2.1** | **验收门槛**：Windows 上独立窗 + **libmpv2** + 动态库，**可播放本地文件**；`loadfile`；可选 `glsl-shaders`；失败信息可读 | ✅ 编码完成（需本机/捆绑 libmpv 2.x） |

**库路径约定（Windows 优先）**

| 场景 | 约定 |
|------|------|
| 开发 | `mpv.lib` + `libmpv-2.dll` 放入 `src-tauri/resources/libmpv/`（`scripts/bundle-libmpv.ps1`）；`build.rs` 会把 DLL **复制到 exe 旁** |
| 安装包 | `resources/libmpv/**` 打入 bundle；发行时仍建议 exe 旁有 `libmpv-2.dll`（否则启动即 DLL_NOT_FOUND） |
| Feature | `pnpm tauri:dev:libmpv`；**链接**需 `mpv.lib`，**运行**需 exe 旁 `libmpv-2.dll` |
| 运行时 | `video_libmpv_status` 探测；独立 VO + Anime4K；gpu-next 与超分互斥；轨切换 / 字幕样式 / Mode 热切换 / HDR prefs |

渲染：E2.1 采用 mpv 独立 VO 窗（非主壳挖洞、非 Canvas 回灌）。全屏/DPI/多显示器按第二窗级处理。

### 3.2.1 E2.1a–c 验收

| 子阶段 | 验收 | 状态 |
|--------|------|------|
| **E2.1a** | 增强窗可切音轨/内封字幕；改 `sub-font-size` 可见；Mode 热切换后 OSD Shaders 变化；弹幕预期文案；`tauri:build:enhanced` 可发行 | ✅ |
| **E2.1b** | HDR tone-mapping / colorspace-hint 设置可辨；本地长视频 scrub 有预览帧 | ✅ |
| **E2.1c** | 选文件夹递归列出视频（列表/网格）；WebDAV 进子目录再播；独立嗅探窗导航命中（或明确失败提示） | ✅ |
| **E2.2** | 本地封面；CONFIG logo/notice；softvol/听视频；增强窗弹幕 ASS/主路出口 | ✅ |
| **E2.3** | WebDAV 当前层封面；扫描进度；网格偏好持久化；封面重生；设置 softvol 镜像 | ✅ |
| **E2.4** | 增强窗 chapter-list 列表 + seek | ✅ |
| **E2.5** | 简易均衡器预置（off/bass/treble/voice）；开播 + 热切 af | ✅ |

### 3.3 Android（E2.A–E2.G）

| 子阶段 | 验收 | 状态 |
|--------|------|------|
| **接线** | Gradle/Cargo/`video_android_open_player` → `openPlayer`；Activity 可启动 | ✅ |
| **Media3** | 本地/http 出画；Artplayer 失败且 `androidFallbackMedia3` 时切入；顶栏返回/重试 | ✅ |
| **libmpv 探测** | `probeLibmpv` / `video_android_libmpv_status`；缺 AAR 不谎称可播 | ✅ |
| **libmpv 宿主** | 真 `MPVView` 反射宿主；shaders 拷贝；loadfile；轨/Anime4K/听视频 UI | ✅ 代码（需本地 AAR） |
| **Anime4K / 轨参数** | Intent extras + Activity 内热切子集 | ✅ |
| **E2.C 发行** | AAR 可选编入；缺文件 assemble 成功；设置页展示 status；check 脚本 | ✅ |
| **E2.D 路径** | 源 `android/libmpv/mpv-android-lib-*.aar`；Gradle 优先直引；gitignore；桌面 resources 不含 AAR | ✅ |
| **E2.E** | 引擎/Anime4K 17 shaders/Mode+/quality/deblur/HDR/softvol300/startSec·headers/OP·ED | ✅ 代码 |
| **E2.F** | Activity 播控壳：手势/轨列表/倍速比例/章节/EQ/听视频 Service/截图/进度/连播 | ✅ 代码 |
| **E2.G** | FlameMaster 叠层 + E3.1 ASS；MediaStore 扫描；WebDAV 多账户；嗅探 JSON 直链 | ✅ 代码 |
| **E-RIFE.0** | prefs + 互斥 + `resources/rife` README + [VIDEO_RIFE.md](./VIDEO_RIFE.md) | ✅ |
| **E-RIFE.1** | 桌面探测 + `rife.vpy` + libmpv `vf` 开播/热切（ncnn） | ✅ 代码（需模型/VS） |
| **E-RIFE.2** | TRT / **DirectML** auto 优选 + 强制后端 + 外置 mpv 同参 | ✅ 代码 |
| **E-RIFE.3** | 设置页 / EnhancePanel；与 Anime4K 互斥；maxInputFps | ✅ |
| **E-RIFE.4** | Android Intent/Host/probe；ncnn 或 soft fallback | ✅ 代码（标准 AAR 无滤镜则仅 fallback） |
| **E-RIFE.5** | 校验脚本 + gitignore + 许可声明 | ✅ |

- 模块：`src-tauri/android/video-player/`
- AAR 源：`src-tauri/android/libmpv/`；FlameMaster：`video-player/libs/DanmakuFlameMaster.aar`
- 命令：`video_android_open_player`、`video_android_libmpv_status`、`video_android_scan_media_store`
- 路由：Android 上 `libmpv`/`media3` → Activity（传 startSec/headers/弹幕路径）
- 脚本：`scripts/android-mpvlib-check.ps1`；RIFE：`scripts/rife-runtime-check.ps1`

---

## 4. Exo / TVBox 解码能力 → 落点映射

| FongMi/TVBox 常见能力 | Reader 落点 |
|----------------------|-------------|
| Exo HLS/DASH | Artplayer MSE；Android 可选 **Media3** |
| IJK 兼容格式 | **libmpv**（不引入 IJK） |
| 硬解开关 | libmpv `hwdec`；Media3 默认硬解策略 |
| 多音轨 / 内封字幕 | libmpv；Media3 轨 API；Artplayer 弱 |
| ASS/SSA 特效 | **libmpv** |
| Anime4K | **libmpv** / 外置 mpv shaders |
| 外置播放器 | **external** |
| 专有 P2P so | Blocked |

---

## 5. 阶段 E 验收清单

| 阶段 | 目标 | 验收 | 状态 |
|------|------|------|------|
| **E0** | 协议 + 许可 | 文档可评审 | ✅ |
| **E1** | 外置深度交接 | mpv 可带字幕/shaders；无 IPC 不崩溃 | ✅ |
| **E2** | 命令/插件脚手架 | feature 可关；stub 不谎称可播 | ✅（已接 libmpv2） |
| **E2.1** | libmpv2 独立窗可播 | **本地文件在独立窗出画+出声** | ✅（需本机/resources DLL） |
| **E2.1a** | 增强核产品化 | 轨 UI + 字幕样式 + Mode 热切 + enhanced 渠道 | ✅ |
| **E2.1b** | 画质/预览 | HDR 最小 prefs + 本地 seek 缩略图 | ✅（SpriteStore 落盘见 [VIDEO_SEEK_THUMBNAILS.md](./VIDEO_SEEK_THUMBNAILS.md)） |
| **E2.1c** | Hub 深化 | 片库递归 + WebDAV 树 + 嗅探窗 | ✅ |
| **E2.2** | 桌面体验收口 | 封面缓存、CONFIG logo/notice、softvol/听视频、增强窗弹幕出口 | ✅ |
| **E2.3** | 片库体验 | WebDAV 当前层封面；扫描进度；网格偏好；封面重生；设置 softvol | ✅ |
| **E2.4** | 增强窗章节 | `video_libmpv_list_chapters` + EnhancePanel seek | ✅ |
| **E2.5** | 简易均衡器 | `audioEqPreset` + `video_libmpv_set_af` | ✅ |
| **E2.A** | Android 增强核 | 插件接线；Media3 可播；libmpv 需 AAR；Artplayer→Media3 回退 | ✅（libmpv 依赖本地 AAR） |
| **E2.B** | Android libmpv 产品化 | AAR 探测/status；真 MPVView；轨/Anime4K/听视频；Media3 返回/重试 | ✅ 代码（运行需 AAR） |
| **E2.C** | Android AAR 发行闭环 | 可选编入；check 脚本；设置页 status；libs README | ✅ |
| **E2.D** | AAR 源目录接线 | `android/libmpv/` 直引；gitignore；桌面 bundle 收窄 | ✅ |
| **E2.E** | Android 引擎对齐小喵 | 17 shaders；Mode+/quality/deblur；HDR；softvol300；开播参数 | ✅ |
| **E2.F** | Android 播控壳 | 手势/轨/章节/EQ/倍速比例/Service/截图/进度连播 | ✅ |
| **E2.G** | Android 弹幕双路径 + 片库深化 | FlameMaster+ASS；MediaStore；WebDAV 账户；嗅探增强 | ✅ |
| **E-RIFE.0** | prefs + 互斥 + 文档骨架 | `frameInterp*` 默认关；KERNEL/ROADMAP/VIDEO_RIFE | ✅ |
| **E-RIFE.1** | 桌面 ncnn 路径 | `rife.vpy` + `video_rife_status` + libmpv `vf` 开播/热切 | ✅ 代码（需 models） |
| **E-RIFE.2** | TRT / DirectML + 外置 mpv | 后端 `auto`/`trt`/`dml`/`ncnn`；外置 `--vf=` | ✅ 代码 |
| **E-RIFE.3** | 设置 / EnhancePanel UI | 与 Anime4K 互斥；maxInputFps/sceneDetect | ✅ |
| **E-RIFE.4** | Android libmpv | Intent + Host；ncnn so 或 soft fallback | ✅ 代码（需增强包） |
| **E-RIFE.5** | 打包 / 许可 | check 脚本；gitignore；许可声明 | ✅ |
| **E3** | 弹弹 + B 站弹幕子集 + wyzie | API + 设置；**播控接线**（TvPlayPane / 弹幕按钮） | ✅ |
| **E3.1** | 增强窗弹幕 ASS 产品化 | `danmaku/to-ass.ts`（\\move/顶底）；prefs；匹配自动 sub-add / 卸下 | ✅ |
| **E4** | 片库 + WebDAV | Hub「片库」可点播尝试 | ✅ |
| **E5** | 嗅探浏览器 | Hub「嗅探」 | ✅ |
| **E6.0** | 番剧薄页 | 与 sites 隔离 | ✅ |
| **E6.1** | 规则编辑/搜索/详情/分集 | 见 BANGUMI 文档验收 | ✅ |
| **E6.2** | 时间表 / 历史 / 弹幕 | 追番归组时间表；`bangumi.history`；复用 E3 | ✅ |

### 落地路径速查

| 能力 | 路径 |
|------|------|
| 协议 / 路由 / Anime4K / RIFE | `src/lib/media/video/playback/`（`frame-interp.ts` · `rife-probe.ts`） |
| 外置深度交接 | `src/lib/media/tv/play/external-player.ts` |
| Rust 命令 | `src-tauri/src/video_playback.rs`（feature `video-libmpv` = `dep:libmpv2`） |
| Android 插件 | `src-tauri/android/video-player/` |
| 弹弹 / B 站 / wyzie | `src/lib/media/video/danmaku/` · `subtitle/wyzie.ts` |
| 片库 / WebDAV | `src/lib/media/video/library/` · `TvLibraryPane` |
| 嗅探 | `src/lib/media/video/sniff/` · `TvSniffBrowserPane` |
| 追番 | `src/lib/media/video/bangumi/`（`rules.ts` · `engine.ts`） · `TvBangumiPane` |
| RIFE 运行时 | `src-tauri/resources/rife/` · [VIDEO_RIFE.md](./VIDEO_RIFE.md) |

---

## 6. 后续文档补丁点

| 时机 | 补丁 |
|------|------|
| E2.1 窗生命周期 / DLL / Anime4K 模式表 | ✅ 见上文 §3 |
| E3 接线 | ✅ |
| E6.1 / E6.2 | ✅ |
| E-RIFE 运行时发放 | 可选资源包 / 首次下载说明（默认不捆绑 VS+模型） |

---

## 7. 明确不做 / 延期（路线图外）

- 应用内 `libtorrent`；SMB/FTP；AI 字幕（主程序 AI）  
- ParadoxSpiral/libmpv-rs；mpv-client-cross 作内嵌主路径  
- Kazumi 规则写入 FongMi Spider CONFIG  
- hdr-toys 全管道（非最小 tone-mapping）  
- B 站登录 / 在线番剧下载（后续统一登录层 + yt-dlp）  
- 挖洞嵌 mpv / 把 libmpv 帧回灌 Artplayer（MpvEnhance 路径）  
- 整仓移植小喵 Compose/Koin  

> E2.G 已落地 FlameMaster 叠层 + ASS；不再将「VO 叠层弹幕」列为延期必做项。  
> **实时 AI 补帧（mpv）**：E-RIFE / [VIDEO_RIFE.md](./VIDEO_RIFE.md)，默认关；不做 DAIN。  
> **Web / Rust 超分+补帧**：见 [VIDEO_WEB_ENHANCE.md](./VIDEO_WEB_ENHANCE.md)（opt-in；与 mpv 路并存）。Artplayer `<video>` 主路本身不做补帧；需自管呈现时钟的 WebCodecs 管线。
