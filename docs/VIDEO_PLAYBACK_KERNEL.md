# 影视播放内核（第二路增强核）

> 状态：协议冻结；E1 完成；**E2.1 桌面 libmpv2 独立窗可播**；**桌面 Anime4K 真源对齐 + shaders/DLL 资源路径已接**（需本机或捆绑 DLL）  
> 选型：`docs/bugs.txt` L31–33 + 规划 Q1–Q15  
> 许可定调：[VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md)（目标 **GPL-3.0-or-later**；根 `LICENSE` / `package.json` 已换证）  
> 番剧：[VIDEO_BANGUMI_KAZUMI.md](./VIDEO_BANGUMI_KAZUMI.md)  
> 排期：[VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md)  
> 与小喵 / Anime4K 上游差异与补强：[VIDEO_ANIME4K_MPV_ANDROID_GAP.md](./VIDEO_ANIME4K_MPV_ANDROID_GAP.md)

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
| **libmpv** | 桌面独立窗；Android Activity | **增强核**：本地/ASS/硬解/Anime4K/HDR |
| **media3** | **仅 Android** | **可选核**：补齐 TVBox/Exo 习惯能力 |
| **external** | 桌面 shell | **第三路**：系统 `mpv`/`vlc`/`system`；参数深度交接 |

**不做**：主 WebView 挖洞嵌 mpv；把 libmpv 帧回灌 Artplayer / Canvas；桌面 Media3；再引入 IJK；Cast/Syncplay；专有 P2P so；完整 Cling；Widevine L1；应用内 BT（延期）。

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

- **采用**：独立播放窗 / Android Activity 上的 **原生 VO**（OpenGL/Vulkan/平台窗句柄交给 mpv）。  
- **不做**：把帧经 IPC 灌进前端 `<canvas>`（高 CPU/延迟）。  
- **暂不做**：主壳 WebView 内嵌 Surface / 挖洞跟滚动（难度高；可播闭环后再评估）。

---

## 2. 路由规则（PlaybackRouter）

实现路径：`src/lib/media/video/playback/`

```
来源 / 用户强制
  ├─ 用户强制 external / libmpv / artplayer / media3 → 对应引擎（覆盖下列默认）
  ├─ file:// / 本地库 / WebDAV → **设置「本地播放方式」**（默认 libmpv）
  └─ Hub / 番剧在线直链（默认） → artplayer
       └─ Android 上 Artplayer 失败且开启「失败切 Media3」→ media3
```

Anime4K / 多音轨 ASS 精细控制：**仅 libmpv**（及外置 mpv 的 shaders/参数子集）。

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
| Feature | `pnpm tauri dev --features video-libmpv`；**链接**需 `mpv.lib`，**运行**需 exe 旁 `libmpv-2.dll` |
| 运行时 | `video_libmpv_status` 探测；独立 VO + Anime4K；gpu-next 与超分互斥 |

渲染：E2.1 采用 mpv 独立 VO 窗（非主壳挖洞、非 Canvas 回灌）。全屏/DPI/多显示器按第二窗级处理。

### 3.3 Android（E2）🟡

- 命令：`video_android_open_player`
- 模块 stub：`src-tauri/android/video-player/`
- **排在 E2.1 桌面可播之后** 再接线 Media3 / libmpv Activity

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
| **E3** | 弹弹 + B 站弹幕子集 + wyzie | API + 设置；**播控接线**（TvPlayPane / 弹幕按钮） | ✅ |
| **E4** | 片库 + WebDAV | Hub「片库」可点播尝试 | ✅ |
| **E5** | 嗅探浏览器 | Hub「嗅探」 | ✅ |
| **E6.0** | 番剧薄页 | 与 sites 隔离 | ✅ |
| **E6.1** | 规则编辑/搜索/详情/分集 | 见 BANGUMI 文档验收 | ✅ |
| **E6.2** | 时间表 / 历史 / 弹幕 | 追番归组时间表；`bangumi.history`；复用 E3 | ✅ |

### 落地路径速查

| 能力 | 路径 |
|------|------|
| 协议 / 路由 / Anime4K | `src/lib/media/video/playback/` |
| 外置深度交接 | `src/lib/media/tv/play/external-player.ts` |
| Rust 命令 | `src-tauri/src/video_playback.rs`（feature `video-libmpv` = `dep:libmpv2`） |
| Android stub | `src-tauri/android/video-player/` |
| 弹弹 / B 站 / wyzie | `src/lib/media/video/danmaku/` · `subtitle/wyzie.ts` |
| 片库 / WebDAV | `src/lib/media/video/library/` · `TvLibraryPane` |
| 嗅探 | `src/lib/media/video/sniff/` · `TvSniffBrowserPane` |
| 追番 | `src/lib/media/video/bangumi/`（`rules.ts` · `engine.ts`） · `TvBangumiPane` |

---

## 6. 后续文档补丁点

| 时机 | 补丁 |
|------|------|
| E2.1 | 窗生命周期、libmpv2 链接说明、Anime4K 模式表、打包动态库路径 |
| E3 接线 | 弹幕注入播控 |
| E6.1 | 规则 schema 定稿与示例 JSON |
| E6.2 | 时间表 / 历史 |

---

## 7. 明确不做 / 延期

- 应用内 `libtorrent`；SMB/FTP（E4 后）；缩略图 seek；AI 字幕（主程序 AI）  
- ParadoxSpiral/libmpv-rs；mpv-client-cross 作内嵌主路径  
- Kazumi 规则写入 FongMi Spider CONFIG  
- 主 WebView 挖洞 / Canvas 回灌  
