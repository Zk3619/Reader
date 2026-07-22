# Reader 音乐模块 × MusicFree 双生态对齐报告

> 基线：`MusicFreeDesktop-master` / `MusicFree-master` 插件协议  
> Reader：LX 五源 + UserApi 为主；MusicFree 插件为 **辅源**（`mf:${pluginId}`）  
> 更新日期：2026-07-22

---

## 1. 结论摘要

Reader 采用 **双生态并存**：

| 生态 | 角色 | 源键 | 运行时 |
|------|------|------|--------|
| LX | 主 | 五源 `kw/wy/...`、`userApi:${id}` | QuickJS + LX shim |
| MusicFree | 辅 | `mf:${pluginId}` | CommonJS Function 沙箱 |

两套协议 **不混用**：MusicFree 插件不走 UserApi 事件模型。

---

## 2. P0 已落地

| 能力 | 状态 | 要点 |
|------|------|------|
| 插件安装 | ✅ | 本地 `.js`、URL、订阅 `plugins.json`、粘贴代码 |
| Deep link | ✅ | `musicfree://install/...`；`.js` 文件自动识别 MF/LX |
| 搜索 | ✅ | 单源 `mf:*`；聚合搜索并入已启用 MF 插件 |
| 播放取链 | ✅ | `getMediaSource`；自定义 Header 经主程序 request 物化 |
| 歌词 | ✅ | `getLyric` → LyricBundle |
| 插件管理 UI | ✅ | 设置 → 音源与账号 → MusicFree 插件分区 |
| 用户变量 / 重定向 | ✅ | `env.getUserVariables()`；alternativePlugin 取链 |
| DB 登记 | ✅ | `audio_sources.kind = mf_plugin` |

---

## 3. P1 桥接层（Hub UI 已接入 MF 源切换）

| 方法 | 桥接模块 | Hub 接入 |
|------|----------|----------|
| `getMusicSheetInfo` | `mf-plugin/browse.ts` | ✅ 歌单分区 |
| `getTopLists` / `getTopListDetail` | 同上 | ✅ 排行榜 |
| `getRecommendSheetTags` / `getRecommendSheetsByTag` | 同上 | ✅ 推荐歌单 |
| `getAlbumInfo` / `getArtistWorks` | 同上 | ✅ 专辑/歌手 MF 浏览 |
| `getMusicComments` | 同上 + `comment.ts` | ✅ 评论面板 |
| `importMusicSheet` | 同上 | ✅ URL 导入 |

---

## 4. P2 体验增强

| 能力 | 状态 |
|------|------|
| 关联歌词（link-lyric） | ✅ resolver + 播放详情对话框 + SearchLyric |
| WebDAV 歌单备份（MF 形态） | ✅ 设置页上传/合并拉取 |
| 主题包（`.mftheme` / 樱花预设） | ✅ 内置樱花 WebGL iframe；通用多槽位 `app/header/body/music-bar/side-bar/page` |
| HLS 专用链路 | ✅ `music-hls.ts` + 播放器 m3u8 分支 |
| 插件懒加载 / 启动自动更新 | ✅ 订阅排序 + Hub 启动自动检查更新 |
| RequestForwarder（axios→request） | ✅ 桌面 `useBackendHttp`；TLS 失败降级 |
| MiniMode 迷你播放窗 | ✅ Tauri 子窗 + 几何持久化 + `clamp_to_screen` / `set_bounds` |
| 蜂窝流量提醒 | ✅ Android `get_android_network_type` + 播放/下载拦截 + Hub 提示条 |
| 悬浮窗权限引导（Android） | ✅ `MusicMobileOverlayGuide` |
| 移动端樱花 fallback | ✅ `sakura-canvas.ts` 2D 花瓣（替代 WebGL iframe） |
| 远程 `.mftheme` → OPFS | ✅ 解压至 `reader-mf-themes/` + blob URL 加载 iframe |

---

## 5. 关键路径

- 类型与源键：`src/lib/media/audio/online/mf-plugin/types.ts`
- 适配器：`.../media-adapter.ts`
- 运行时：`.../runtime.ts`
- 引擎：`.../index.ts`
- 发现桥接：`.../browse.ts`
- 路由：`online/source-router.ts`、`online-resolver.ts`、`lyric-resolver.ts`
- 主题 iframe / OPFS：`.../mf-theme-iframe.ts`、`.../mf-theme-opfs.ts`、`MusicHubMfThemeLayer.tsx`
- 迷你窗：`music-mini-player-window.ts`、`music_mini_player.rs`
- 网络检测：`lib/platform/network.ts`、`cellular-guard.ts`

---

## 6. 与 LX 对齐文档关系

- LX 主路径见 [`music-module-lx-alignment.md`](./music-module-lx-alignment.md)
- 产品决策不变：不做音乐独立 HTTP 代理；MF 自定义 Header 走主程序统一 `request` 物化
