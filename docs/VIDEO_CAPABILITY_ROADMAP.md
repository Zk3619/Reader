# 影视域能力补齐路线图

> **状态：影视域路线图已收口**（A–E6 / 18 项在自述范围内落地；Blocked / KERNEL 延期见文末，不再作为「未完成必做」）。

对标：TV-fongmi（FongMi/TV）契约与产品能力；参考 TVBoxOS、tvbox-master（源仓）。  
播放增强核：[VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)；许可定调：[VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md)；番剧对齐：[VIDEO_BANGUMI_KAZUMI.md](./VIDEO_BANGUMI_KAZUMI.md)；Anime4K×小喵差异与补强：[VIDEO_ANIME4K_MPV_ANDROID_GAP.md](./VIDEO_ANIME4K_MPV_ANDROID_GAP.md)；实时补帧：[VIDEO_RIFE.md](./VIDEO_RIFE.md)。

平台约束：**Tauri 桌面优先**；Android 已有 JAR Dex；纯 Web 降级。  
**Blocked** 项不硬移植 Android 专有 so/SDK，改为文档声明 + 可选系统交接。  
**开源目标许可**：**GPL-3.0-or-later**（见许可文档）；`video-libmpv` 仅控制是否捆绑原生库。

---

## 分期总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| **A** | 契约文档 + 搜索繁简 + 换源策略 + type4 + 字幕/弹幕/OP·ED | **已完成** |
| **B** | LOCAL API + rules 深执行 + 多机 sync + JAR/Py 说明硬化 | **已完成** |
| **C** | 外置播放器 + ClearKey DRM 尽力 + 网盘/YT UX | **已完成（桌面子集）** |
| **D** | DLNA / 双端 UI / P2P | **文档落地；功能 Blocked/Defer** |
| **E0** | 播放内核协议 + libmpv 许可分析 | **已完成** |
| **E1** | 外置 mpv 深度交接（参数/IPC/shaders） | **已完成（桌面）** |
| **E2** | 桌面 libmpv 独立窗 → Android libmpv → Media3 | **桌面 E2.1–E2.5 ✅**；**Android E2.A–E2.D ✅**（Media3；libmpv 需本地 AAR） |
| **E2.1** | 桌面 **libmpv2** 独立窗最小可播（本地文件） | ✅（需本机/resources 动态库；见 `resources/libmpv`） |
| **E2.2** | 桌面体验收口（封面 / logo·notice / softvol / 弹幕出口） | ✅ |
| **E2.3** | 片库体验（WebDAV 封面 / 扫描进度 / 网格偏好 / 设置 softvol） | ✅ |
| **E2.4** | 桌面增强窗章节列表（chapter-list → seek） | ✅ |
| **E2.5** | 桌面简易均衡器预置（off/bass/treble/voice） | ✅ |
| **E2.A** | Android 增强核接线 + Media3 + libmpv（AAR） | ✅ 代码；运行需本地 AAR |
| **E2.B** | Android libmpv 宿主 + Media3 打磨 | ✅ 代码；真机需 AAR |
| **E2.C** | Android AAR 可选进包 + 设置探测 + 发行说明 | ✅ |
| **E2.D** | AAR 路径 `android/libmpv/` + Gradle 直引 + gitignore + 桌面资源收窄 | ✅ |
| **E2.E** | Android 引擎/Anime4K/HDR/开播参数对齐小喵 | ✅ |
| **E2.F** | Android 播控壳（手势/轨/章节/EQ/Service…） | ✅ |
| **E2.G** | FlameMaster+ASS 弹幕；MediaStore；WebDAV 账户；嗅探增强 | ✅ |
| **E-RIFE.0–5** | 实时 RIFE 补帧（桌面 TRT/DirectML/ncnn + 外置 mpv + Android ncnn/soft） | ✅ 代码；运行需 VS/模型或增强 AAR |
| **E3** | 弹弹匹配 + B 站弹幕子集 + wyzie | **API + 播控接线 ✅**（Artplayer；无 key 隐藏） |
| **E3.1** | 增强窗弹幕 ASS 产品化（\\move / prefs / 自动挂载） | ✅ |
| **E4** | 影视本地库 + WebDAV 直连播 | **片库页落地** |
| **E5** | 内置网页嗅探浏览器 | **Hub 嗅探页落地** |
| **E6.0** | 独立番剧薄页（与 Spider 隔离） | ✅ |
| **E6.1** | Kazumi 式：规则编辑/导入导出/搜索/详情/分集播 | ✅ |
| **E6.2** | 时间表、历史、弹幕接线 | ✅（E7 起由 BGM 元数据 + keep/history 接替） |
| **E7.0–E7.5** | Bangumi.tv 元数据中心 + Kazumi 规则生态补齐 | 进行中（见 VIDEO_BANGUMI_KAZUMI.md） |

---

## 与参考项目实现差距

### 播放器 / 画质（小喵、mpvRx、mpvEx 等）

| 能力 | 参考仓现状 | Reader 现状 | 收口结论 |
|------|------------|-------------|----------|
| 内嵌 libmpv VO | 小喵/mpvRx 有 | 桌面独立窗 ✅；Android MPVView（需本地 AAR） | 真机自验（见 KERNEL 验收清单） |
| Anime4K Mode UI | 小喵完整 | 桌面热切换 ✅；Android Activity UI ✅ | 真机自验 |
| HDR / 缩略图 | mpvRx 强 | E2.1b + 封面缓存 | **已决策后置**：hdr-toys 全管道（KERNEL §7） |
| Media3 | nextplayer 等 | **E2.A–E2.D** 可播 + AAR 源目录接线 | 真机自验 |
| 弹弹 / B 站弹幕 | 小喵/弹弹闭环 | 主路 + E3.1 ASS + **E2.G FlameMaster** | B 站登录下载 → yt-dlp 统一登录层（延期） |
| 片库 / WebDAV / 嗅探 | 各仓成熟度不一 | E2.1c–E2.5 封面/UX/章节/EQ | 路线图内已闭环 |
| FongMi Spider 契约 | 小喵基本不走 | A–C 已完成；logo/notice UI ✅ | 维持 |

### 番剧（Kazumi + Bangumi.tv）

| 能力 | Kazumi | Reader | 收口结论 |
|------|--------|--------|----------|
| Bangumi.tv 元数据 | ✅ | E7 meta 层 | E7.0–1 |
| XPath / API 规则 | ✅ | 适配器 + JSONPath | E7.2 |
| 规则商店订阅 | KazumiRules | MusicFree 式 URL 订阅 | E7.2 |
| WebView 抽流 | ✅ | sniff → bangumi engine | E7.3 |
| 追番 / 历史 | Hive | 影视 keep/history `kind=bangumi` | E7.1 |
| 弹幕过滤 / 发送 | ✅ | E3 扩展 | E7.4 |
| 磁盘缓存导出 | 下载器 | 对标音乐缓存 | E7.5 |
| 一起看 / Cling / OAuth | ✅ | 不做 | **skip** |

完整映射见 [VIDEO_BANGUMI_KAZUMI.md](./VIDEO_BANGUMI_KAZUMI.md)。

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
| 8 | 播放内核 | 多核增强 | E0–E2.D | ✅ 代码 | Artplayer + libmpv2 + Media3；**运行**需本机 DLL/AAR。Android 真机清单见 KERNEL |
| 9 | DRM Widevine | 尽力而为 | C | ✅ 子集 | DASH ClearKey；Widevine L1 不承诺 |
| 10 | 弹幕设置 + 远程 | 设置+LOCAL | A/B | ✅ | 设置页 + `do=danmaku` / refresh danmaku |
| 11 | 字幕 / OP·ED / PiP | 接线+跳过 | A | ✅ | 片头：Artplayer + Libmpv/外置开播；片尾：仅 Artplayer 主路 |
| 12 | 磁力/ed2k/迅雷 | 系统交接 | A | ✅ | `shell.open`；应用内 BT 延期 |
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
| `logo` / `notice` | ✅ | 首页横幅 + 设置预览 |

站点 `type`：`0/1/3/4` ✅；解析 `type`：`0–4` ✅。

完整字段语义仍以 [TV-fongmi/docs/CONFIG.md](../../TV-fongmi/docs/CONFIG.md) 为准。  
**番剧规则不写入上述 CONFIG**（见 BANGUMI 文档）。

---

## 落地文件索引

| 能力 | 路径 |
|------|------|
| 路线图 | `docs/VIDEO_CAPABILITY_ROADMAP.md` |
| 播放内核 | `docs/VIDEO_PLAYBACK_KERNEL.md` |
| Anime4K × 小喵 × Reader 差异/补强 | `docs/VIDEO_ANIME4K_MPV_ANDROID_GAP.md` |
| libmpv 许可 / GPL 定调 | `docs/VIDEO_LIBMPV_LICENSE.md` |
| Kazumi 番剧对齐 | `docs/VIDEO_BANGUMI_KAZUMI.md` |
| LOCAL 子集说明 | `docs/VIDEO_LOCAL_API.md` |
| 繁简搜索 | `src/lib/media/tv/site-api.ts` |
| 换源策略 | `src/lib/media/tv/play/vod-fallback-policy.ts` |
| type4 | `src/lib/media/tv/parse/parse-job.ts` |
| rules/headers | `src/lib/media/tv/net/sniff-rules.ts` + `parse/sniff.ts` |
| LOCAL/sync | `src-tauri/src/tv_proxy.rs` + `local/sync.ts` + `local/action-bridge.ts` |
| 外置播放 | `src/lib/media/tv/play/external-player.ts` + `src/lib/media/video/playback/` |
| ClearKey | `src/lib/media/video/artplayer/custom-types.ts` |
| 播放偏好 | `src/lib/media/tv/play/tv-play-prefs.ts` |
| 番剧模型/UI | `src/lib/media/video/bangumi/` · `TvBangumiPane.tsx` |

---

## 明确不做（本路线图）

- 移植 FongMi `thunder` / `jianpian` / `tvbus` / `forcetech` 原生库  
- 拆 leanback + mobile 两套 UI flavor  
- 承诺 Widevine L1 / 全网盘官方 API 复刻 / 完整 DLNA DMR  
- 主 WebView 挖洞嵌 mpv；libmpv 帧回灌 Artplayer  
- 桌面 Media3；再引入 IJK  
- 应用内 BT（延期至统一下载模块或用户反馈）  
- Kazumi「一起看」/ 完整 Cling；番剧规则混入 Spider CONFIG  
- Bangumi OAuth 五态同步  
- Kazumi 完整 M3U8 下载器（E7.5 仅磁盘缓存+导出清单）  
- hdr-toys 全管道  
- B 站登录/下载（后续 yt-dlp 统一登录层）  
- 主 WebView 挖洞嵌 mpv；libmpv 帧回灌 Artplayer 
