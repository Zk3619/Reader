# 音乐设置 UI 对照基线（LX Music / Reader）

本文档以 LX Music Desktop `2.12.2` 为设置项语义和音乐主题配色参考。Reader 按自身音乐业务重新归类，不复刻 LX 的主程序级信息架构。

> **能力对齐总览**见 [`music-module-lx-alignment.md`](./music-module-lx-alignment.md)（2026-07-22 可选增强：IR 增益 + MediaSession seek）。

## 分类基线

Reader 音乐设置固定按以下顺序显示 11 类：

1. 主题与外观
2. 音源与账号
3. 播放
4. 播放详情
5. 桌面歌词
6. 搜索
7. 列表
8. 下载
9. 快捷键
10. 服务与同步
11. 数据与维护

分类元数据由
`src/components/media/viewer/audio/music/settings/music-settings-sections.ts`
统一维护；不得在面板和路由中各自复制另一份顺序。

## 对齐原则

- LX 原有设置优先使用其简体中文标题、说明和顺序。
- Reader 独有能力放入明确标注的“Reader 扩展”或“维护工具”分组。
- Reader 尚未实现的 LX 能力必须显示真实能力说明，不得提供无消费端的伪开关。
- 平台不支持时显示平台原因；不得留下只有占位符或内部字段名的空页面。
- 同一持久化字段只保留一个主要入口，避免用户无法判断两个开关的优先关系。
- 搜索、歌单和排行榜页面“更多”菜单已有的布局、来源和分页配置，不在设置页重复展示。
- 即时动作（下载任务、同步推送、批量匹配）与持久化设置分组展示。
- 网络、更新、关于等主程序级内容只归主程序设置。

## 当前页面映射

| Reader 分类 | 页面 | 当前结论 |
| --- | --- | --- |
| 主题与外观 | `MusicSettingsTheme` | 10 个 LX 配色灵感预设；仅覆盖 `module.music` |
| 音源与账号 | `MusicSettingsBasic` | 自定义源与平台账号集中管理 |
| 播放 | `MusicSettingsPlay` | 播放、歌词偏移、蓝牙歌词、输出/EQ、环境音与环绕 |
| 播放详情 | `MusicSettingsPlayDetail` | 歌词布局与交互 |
| 桌面歌词 | `MusicSettingsDesktopLyric` | 桌面歌词窗口；Android 悬浮歌词开关与权限 |
| 搜索 | `MusicSettingsSearch` | 热门、历史、聚焦及离开页面清理；不重复页面布局选项 |
| 列表 | `MusicSettingsList` | 列表显示、播放交互、添加位置、拖拽与队列 |
| 下载 | `MusicSettingsDownload` | 路径、并发、换源、命名；旁路多轨歌词与编码；MP3/FLAC 嵌入分轨 |
| 快捷键 | `MusicSettingsHotKey` | 仅全局快捷键；明确不做软件内录制 |
| 服务与同步 | `MusicSettingsServices` | LX Sync、WebDAV/GitHub、OpenAPI 与绑定列表同步 |
| 数据与维护 | `MusicSettingsDataMaintenance` | 备份（含 TXT/CSV）、缓存、Dislike 与本地曲匹配 |

## 音乐模块主题

- 内置音乐预设只写入 Theme Pack V3 的 `module.music` 目标，不污染主程序和阅读器。
- 选择“跟随主程序”会清除 `module.music` 显式预设。
- `music.playDetail` 与 `music.desktopLyric` 默认继承音乐模块主题；它们的显式覆盖仍优先。
- 内置预设名称和主色参考 LX，Reader 不复制 LX 的全局 CSS、背景素材或页面结构。

## 已明确的能力差异

- **下载嵌入**：MP3（ID3）与 FLAC（Vorbis Comment / PICTURE）均支持；旁路 `.lrc` 可合并译/罗/`awlrc`，编码 utf8（BOM）或 gbk（Tauri）。
- Reader 当前仅提供音乐**全局**快捷键，不提供 LX 的软件内快捷键录制和冲突检测（设置页已说明）。
- 音乐网络请求继承主程序统一请求层；**不做**音乐模块独立 HTTP 代理。
- Web 不支持桌面歌词第二窗、全局快捷键和本机 OpenAPI。
- Android 悬浮歌词已实现（需悬浮窗权限）；桌面歌词任务栏显示、自动刷新置顶和主屏幕边界限制以 Tauri 桌面端为准。
- macOS 状态栏歌词不在通用播放设置中展示（平台专属；可用桌面歌词窗）。
- Android 通知栏：MediaStyle + 封面；紧凑 prev/play/next；展开 ±10s；MediaSessionCompat 支持拖拽进度。

## 播放设置对齐

- LX 的通用播放项按原顺序显示；macOS 专属状态栏歌词不在 Reader
  的通用播放页展示。
- “启动软件后自动播放”只影响启动时恢复的歌曲；Reader 的“选中歌曲后播放”
  作为独立扩展设置，避免两个语义混用。
- 播放防休眠在 Windows 使用系统执行状态，在 Android/Web 使用平台支持的屏幕唤醒能力。
- 任务栏播放进度使用 Tauri 窗口进度 API；Web 与不支持该能力的平台静默降级。
- “清空已播放列表”对应随机播放历史，不会清空当前播放队列；切换列表清空队列仍是
  Reader 列表页中的独立设置。
- 简体转繁体同时应用于播放歌词和另存的 `.lrc` 歌词文件。
- 最大声道数与输出设备移除检测由 Web Audio/媒体设备 API 提供；不支持的
  WebView 会在音频输出区域显示降级说明。
- 全局「歌词偏移」为默认值；播放详情可另设本曲偏移（持久化）。
- 「环境音 / 环绕」：13 个预设；切换时写入 LX `convolutions` 默认 main/send 增益，设置页可微调；优先加载 `public/music-ir` 下 LX WAV，否则程序化 IR。
- Android「蓝牙/车机歌词」将当前行写入通知元数据。
- Deeplink 打开本地 `.lxmc`/歌单 JSON 或 UserApi `.js` 前会确认。
- Android MediaSessionCompat：通知/锁屏支持拖拽 seek（同步 position/duration）。

## 完成标准

1. 11 个音乐业务分类的顺序、标题与路由映射有自动化测试。
2. 每个交互设置都有持久化与消费端；无消费端能力仅作为限制说明。
3. LX 原项与 Reader 扩展在视觉分组和文案上可明确区分。
4. Web、Tauri 桌面和 Android 均有确定的能力检测与降级说明。
5. 旧音乐设置、LX dotted key、旁路存储及旧主题包保持兼容。
