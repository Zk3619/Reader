# Reader 音乐模块 × LX Music 能力对齐报告

> 基线：`lx-music-desktop-master`（约 2.12.x）与 `lx-music-mobile-master`  
> Reader：Hub 分区实现，不复刻 LX 主程序壳层  
> 更新日期：2026-07-22（可选增强：IR 增益矩阵 + MediaSession seek）

配套可视化盘点：Cursor 画布 `music-module-lx-gaps.canvas.tsx`（本机 Cursor projects/canvases）。

---

## 1. 结论摘要

Reader 已覆盖 LX **核心闭环**：五源 + User API、搜索/歌单/排行榜/我的列表、临时队列与稍后播、换源与不喜欢、播放详情歌词、桌面歌词（Tauri 第二窗 + Android 悬浮层）、下载任务与多轨旁路歌词、MP3/FLAC 标签嵌入、LX Sync / OpenAPI（Tauri）、Deeplink（含本地文件与导入确认）。

产品决策上 **不做**：音乐模块独立 HTTP 代理、软件内快捷键录制与冲突检测。  
平台专属 **不进通用页**：macOS 状态栏歌词（可用桌面歌词窗替代）。

---

## 2. 本轮落地成果（按领域）

### 2.1 协议与导入

| 能力 | 状态 | 要点 |
|------|------|------|
| Deeplink `player` / `music` / `songlist` | ✅ | `lxmusic://` + `reader-music://` |
| 本地 `file://` / `content://` | ✅ | 音频导入并播放；`.lxmc`/`.json` 歌单；`.js` UserApi |
| 打开前确认 | ✅ | `.lxmc`/`.json` 与 UserApi `.js` 使用 `window.confirm` |
| `.lxmc` gzip 分片 | ✅ | 列表更多导出；导入对话框 |
| TXT / CSV 备份导出 | ✅ | UTF-8 BOM，对齐 LX |

### 2.2 播放与音效

| 能力 | 状态 | 要点 |
|------|------|------|
| EQ 十段 + 音调 | ✅ | 既有 |
| 卷积环境音 / 环绕 | ✅ | 13 预设 + LX 默认增益矩阵；`public/music-ir/*.wav` 可选加载；否则程序化 IR |
| 原始/环境增益调节 | ✅ | 切换预设写入 LX 默认值；设置页可微调 |
| 输出设备 / 最大声道 / 设备移除停播 | ✅ | Web Audio；不支持时降级说明 |
| 逐曲歌词偏移 | ✅ | 全局 + 本曲；详情「本曲偏移」 |

### 2.3 歌词与桌面

| 能力 | 状态 | 要点 |
|------|------|------|
| 播放详情译/罗/逐字 | ✅ | |
| Tauri 桌面歌词窗 | ✅ | |
| Android 悬浮歌词 | ✅ | WindowManager overlay + 权限 |
| 蓝牙/车机歌词（轻量） | ✅ | 通知 metadata 推当前行 |
| macOS 状态栏歌词 | ○ 平台 | 不进通用播放设置 |

### 2.4 下载

| 能力 | 状态 | 要点 |
|------|------|------|
| 旁路 `.lrc` 多轨合并 | ✅ | T/R/`awlrc`；utf8 BOM / gbk(Tauri) |
| MP3 ID3 嵌入 | ✅ | |
| FLAC Vorbis + PICTURE | ✅ | |

### 2.5 浏览与系统

| 能力 | 状态 | 要点 |
|------|------|------|
| 专辑 / 歌手 Hub 页 | ✅ | 右键入口；多源 `singerId`；kw/mg 艺名兜底 |
| Android MediaSession | ✅ | MediaStyle + 封面 + ±10s；**锁屏/通知拖拽 seek**（ACTION_SEEK_TO） |
| 电池优化设置入口 | ✅ | |
| 音乐独立 HTTP 代理 | ✕ 不做 | 归主程序统一请求层 |
| 软件内热键录制 | ✕ 不做 | 仅全局热键 |

---

## 3. 与 LX 的差异矩阵（抽样）

| 领域 | 能力 | LX | Reader | 状态 |
|------|------|----|--------|------|
| 音源 | 五源 + UserApi | Desktop/Mobile | 有 | 已对齐 |
| 音源 | 独立 HTTP 代理 | SettingNetwork | 无 | 明确不做 |
| 音源 | 专辑/歌手页 | 源站分散 | Hub 叠加页 | 已对齐 |
| 播放 | 卷积/环绕 | IR WAV + 增益表 | 增益表已对齐；WAV 可选放入 public/music-ir | 子集→接近 |
| 播放 | 输出设备等 | Desktop | Web Audio | 已对齐（降级） |
| 系统 | 通知栏控制 | TrackPlayer | MediaSessionCompat + seek | 已对齐（子集：无完整车机协议） |
| 协议 | Deeplink + 本地文件 | Mobile 完整 | 已接线 + 确认 | 已对齐 |
| 系统 | 软件内热键录制 | 有 | 不做 | 明确不做 |

---

## 4. 关键代码入口

| 主题 | 路径 |
|------|------|
| Deeplink / 本地文件 | `src/lib/media/audio/music-deeplink.ts` |
| 卷积预设 / 增益 / WAV | `src/lib/media/audio/engine/convolution-presets.ts` |
| Web Audio 音效 | `src/lib/media/audio/engine/web-audio-player.ts` |
| 可选 IR 资源 | `public/music-ir/README.md` |
| Android 通知 / Session | `.../MusicMediaService.kt` |
| Android JS 桥 | `src/lib/media/audio/platform/android-media-session.ts` |
| 设置模型 | `src/lib/media/audio/music-settings.ts` |
| 设置对照审计 | `docs/music-settings-lx-audit.md` |

---

## 5. 建议的后续增强（非阻塞）

1. **随包分发 IR WAV**：若许可允许，可将 LX filters 打入发行包，免手工复制到 `public/music-ir/`。  
2. **用户自定义卷积预设**：对齐 LX 保存/删除用户卷积预设列表。  
3. **审计文档持续同步**。

---

## 6. 测试与验收建议

- 手工：  
  - 切换各环境混响；确认增益随预设变化；放入 WAV 后听感变化  
  - Android：锁屏/通知拖拽进度；±10s；封面与播放状态  
  - `.lxmc`/`.js` Deeplink 确认对话框  

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-22 | 首版对齐汇总 |
| 2026-07-22 | 确认对话框、±10s、13 预设、singerId |
| 2026-07-22 | LX 增益矩阵 + 可选 WAV；MediaSessionCompat 拖拽 seek；修复 setConvolution 仅认 room/hall |
