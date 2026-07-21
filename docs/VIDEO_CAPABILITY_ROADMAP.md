# 影视域能力补齐路线图

对标：TV-fongmi（FongMi/TV）契约与产品能力；参考 TVBoxOS、tvbox-master（源仓）。

平台约束：**Tauri 桌面优先**；Android 已有 JAR Dex；纯 Web 降级。  
**Blocked** 项不硬移植 Android 专有 so/SDK，改为文档声明 + 可选系统交接。

---

## 分期总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| **A** | 契约文档 + 搜索繁简 + 换源策略 + type4 + 字幕/弹幕/OP·ED | **已完成** |
| **B** | LOCAL API + rules 深执行 + 多机 sync + JAR/Py 说明硬化 | **已完成** |
| **C** | 外置播放器 + ClearKey DRM 尽力 + 网盘/YT UX | **已完成（桌面子集）** |
| **D** | DLNA / 双端 UI / P2P | **文档落地；功能 Blocked/Defer** |

---

## 18 项对照与处置

| # | 能力 | 处置 | 阶段 | 状态 | 说明 |
|---|------|------|------|------|------|
| 1 | 配置契约兼容 | 文档矩阵 | A | ✅ | `types.ts` + 本文件矩阵；对照 FongMi CONFIG.md |
| 2 | JAR csp_* | 持续硬化 | B | ✅ | 桌面侧车；设置页标明 Guard/JNI=Android-only |
| 3 | Python | 打包/探测 | B | ✅ | 本机 CPython → Pyodide；设置页展示 kind/detail |
| 4 | 多站并行搜索 + 繁简 | 实现 | A | ✅ | t2s + 双查 |
| 5 | 失败自动换源/换线 | 实现 | A | ✅ | VodFallbackPolicy |
| 6 | P2P 特殊引擎 | Blocked | D | ✅ 拒绝 | extractors 明确拒绝 tvbus/force/jianpian |
| 7 | 超级解析 type4 | 实现 | A | ✅ | `runSuperParse` |
| 8 | 播放内核 | 增强不替换 | C | ✅ | Artplayer + 外置 mpv/VLC/系统 |
| 9 | DRM Widevine | 尽力而为 | C | ✅ 子集 | DASH ClearKey；Widevine L1 不承诺 |
| 10 | 弹幕设置 + 远程 | 设置+LOCAL | A/B | ✅ | 设置页 + `do=danmaku` / refresh danmaku |
| 11 | 字幕 / OP·ED / PiP | 接线+跳过 | A | ✅ | `Result.sub` + 秒数跳过 + PiP |
| 12 | 磁力/ed2k/迅雷 | 系统交接 | A | ✅ | `shell.open` |
| 13 | 网盘 / YouTube | 维持+UX | C | ✅ | yt-dlp 明确错误；网盘依赖 CSP+token |
| 14 | DLNA 投屏 | 低优 | D | ✅ 降级 | `cast→push`；无 Cling |
| 15 | 本地 HTTP API | 按 LOCAL 补齐 | B | ✅ | 见 [VIDEO_LOCAL_API.md](./VIDEO_LOCAL_API.md) |
| 16 | 多机同步 history/keep | 实现 | B | ✅ | `do=sync` + 设置页推送 |
| 17 | DoH/proxy/hosts/ads | 深执行 | B | ✅ | + `rules[]` 嗅探 + `headers[]` 注入 |
| 18 | 双端 UI | Defer | D | ✅ 文档 | 桌面响应式；不拆 leanback/mobile |

---

## 配置契约支持矩阵（摘要）

| 顶层字段 | Reader | 备注 |
|----------|--------|------|
| `spider` / `sites` / `parses` / `lives` | ✅ | 核心 |
| `doh` / `proxy` / `hosts` / `ads` | ✅ | `net/rules.ts` + 设置 UI |
| `flags` / `danmaku` / `wallpaper` / `urls` | ✅ | |
| `headers` | ✅ | `headersForUrl` 注入 tvRequest |
| `rules` | ✅ | `sniff-rules.ts` → 嗅探 regex/exclude |
| `logo` / `notice` | ⚠ | 解析可存；UI 未全用 |

站点 `type`：`0/1/3/4` ✅；解析 `type`：`0–4` ✅。

完整字段语义仍以 [TV-fongmi/docs/CONFIG.md](../../TV-fongmi/docs/CONFIG.md) 为准。

---

## 落地文件索引

| 能力 | 路径 |
|------|------|
| 路线图 | `docs/VIDEO_CAPABILITY_ROADMAP.md` |
| LOCAL 子集说明 | `docs/VIDEO_LOCAL_API.md` |
| 繁简搜索 | `src/lib/media/tv/site-api.ts` |
| 换源策略 | `src/lib/media/tv/play/vod-fallback-policy.ts` |
| type4 | `src/lib/media/tv/parse/parse-job.ts` |
| rules/headers | `src/lib/media/tv/net/sniff-rules.ts` + `parse/sniff.ts` |
| LOCAL/sync | `src-tauri/src/tv_proxy.rs` + `local/sync.ts` + `local/action-bridge.ts` |
| 外置播放 | `src/lib/media/tv/play/external-player.ts` |
| ClearKey | `src/lib/media/video/artplayer/custom-types.ts` |
| 播放偏好 | `src/lib/media/tv/play/tv-play-prefs.ts` |

---

## 明确不做（本路线图）

- 移植 FongMi `thunder` / `jianpian` / `tvbus` / `forcetech` 原生库  
- 拆 leanback + mobile 两套 UI flavor  
- 承诺 Widevine L1 / 全网盘官方 API 复刻 / 完整 DLNA DMR  
