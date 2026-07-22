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
| 插件安装 | ✅ | 本地 `.js` / 任意订阅 `.json`、URL、粘贴（脚本或 JSON 清单） |
| Deep link | ✅ | `musicfree://install/...`；`.js` / MF `plugins.json` 自动识别 |
| 搜索 | ✅ | 单源 `mf:*`；聚合搜索并入已启用 MF 插件 |
| 播放取链 | ✅ | `getMediaSource` 全音质回退；自定义 Header：Tauri 走 RequestForwarder 端口，Web 物化 blob |
| 歌词 | ✅ | `getLyric` → LyricBundle |
| 插件管理 UI | ✅ | 设置 → 音源与账号 → MusicFree 插件分区 |
| 用户变量 / 重定向 | ✅ | `env.getUserVariables()`；alternativePlugin 取链 |
| DB 登记 | ✅ | `audio_sources.kind = mf_plugin` |
| 插件脚本落盘 | ✅ | 索引 localStorage；脚本 Tauri `Audio/musicfree-plugins/*.js` / Web OPFS；旧版整包迁移 |
| local-plugin | ✅ | 内置 `mf:local`（平台「本地」）；`getMediaSource` / `getLyric` / `importMusicItem|Sheet` |

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
| 主题包（`.mftheme` / 樱花预设） | ✅ 内置樱花；槽位 `app/header/body/music-bar/side-bar/page` 已挂载 |
| HLS 专用链路 | ✅ `music-hls.ts` + 播放器 m3u8 分支 |
| 插件懒加载 / 启动自动更新 | ✅ 订阅排序 + Hub 启动自动检查更新 |
| RequestForwarder（axios→request） | ✅ 桌面 `useBackendHttp`；TLS 失败降级 |
| RequestForwarder 本地端口 | ✅ Tauri `127.0.0.1:52735+`（`music_request_forwarder.rs`）；带 Header 播放优先代理 URL |
| MiniMode 迷你播放窗 | ✅ Tauri 子窗 + 几何持久化 + `clamp_to_screen` / `set_bounds` |
| 蜂窝流量提醒 | ✅ Android `get_android_network_type` + 播放/下载拦截 + Hub 提示条 |
| 悬浮窗权限引导（Android） | ✅ `MusicMobileOverlayGuide` |
| 移动端樱花 fallback | ✅ `sakura-canvas.ts` 2D 花瓣（替代 WebGL iframe） |
| 远程 `.mftheme` → OPFS | ✅ 解压至 `reader-mf-themes/` + blob URL 加载 iframe |
| 沙箱 `__musicfree_require` / `ensurePluginInitialized` | ✅ 对齐 Desktop |
| Cookie polyfill | ✅ 持久化 jar（非 Electron session，API 兼容） |
| `musicfree/storage` + `@musicfree/storage` | ✅ 单 chunk + 10MB 上限 |
| `getMediaSource` 全音质回退 | ✅ `low/standard/high/super` 阶梯；每档最多 2 次、150ms；null/`NOT RETRY` 跳下一档 |

---

## 5. 仍刻意不同 / 弱于 Desktop

| 项 | 说明 |
|----|------|
| Cookie 后端 | 内存+localStorage jar，非 Chromium 网络栈共享 |
| Web 带 Header 播放 | 无本机代理端口时仍物化 blob（Tauri 已走 RequestForwarder） |
| local-plugin 曲库 | 导入仍写入 Reader 本地歌单 / 文件库，非 Desktop 独立「本地」歌单体系 |

## 5.1 相对 any-listen 已补齐（2026-07-22）

| 能力 | 状态 |
|------|------|
| 本地曲 findMusic 播放链路 | ✅ `autoMatchLocalOnline` |
| WebDAV 远程曲库 + 可选缓存 | ✅ 设置「服务与同步」 |
| 邻曲 crossfade | ✅ 听感接近无缝，非真 gapless |
| 标题栏 / macOS 状态栏歌词 | ✅ |
| Web 歌单浏览与播放 | ✅ 阅读 Web 服务 `#/music`（无登录踢出） |
| 主壳托盘音乐菜单 | ✅ |

---

## 6. 关键路径

- 类型与源键：`src/lib/media/audio/online/mf-plugin/types.ts`
- 适配器：`.../media-adapter.ts`
- 运行时：`.../runtime.ts`；polyfill：`.../polyfill/{cookies,storage}.ts`
- 引擎：`.../index.ts`；脚本落盘：`.../plugin-disk-store.ts`；内置本地：`.../local-plugin.ts`
- 音质回退：`.../media-source-quality.ts`；播放代理：`.../request-forwarder.ts` + `src-tauri/src/music_request_forwarder.rs`
- 发现桥接：`.../browse.ts`
- 路由：`online/source-router.ts`、`online-resolver.ts`、`lyric-resolver.ts`
- 主题 iframe / OPFS：`.../mf-theme-iframe.ts`、`.../mf-theme-opfs.ts`、`MusicHubMfThemeLayer.tsx`
- 迷你窗：`music-mini-player-window.ts`、`music_mini_player.rs`
- 网络检测：`lib/platform/network.ts`、`cellular-guard.ts`

---

## 7. 与 LX 对齐文档关系

- LX 主路径见 [`music-module-lx-alignment.md`](./music-module-lx-alignment.md)
- 产品决策：Tauri 使用本机 RequestForwarder；Web 仍走统一 `request` 物化
