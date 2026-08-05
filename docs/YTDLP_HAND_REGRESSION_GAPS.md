# yt-dlp 手写 IE 行为回归清单

> 自动生成 + 人工验收：`node src/lib/download/ytdlp/port/scan-hand-gaps.mjs`
> 生成时间：2026-08-05（第五轮验收）

共 **11** 处 P2「best-effort / 站点私有」标记，**0** 处 P0/P1 阻塞项。

## 优先级状态

| 优先级 | 模式 | 状态 |
|--------|------|------|
| P0 | `impersonate` | ✅ enhanced / `tls-impersonate`；lite 默认不支持 xhamster/wsj |
| P0 | `AES decryption` | ✅ `aes.ts` + `hls-native.ts` AES-128 |
| P1 | `not implemented` | ✅ 仅 `zingmp3` 上游占位 throw；其余已对齐或 expected 错误 |
| P2 | `best-effort` | 📋 文档化（见下表）；不阻塞冒烟 |

## 真 URL 冒烟（P1）

✅ Tauri 桌面复验：tube8 / ZDFChannel 在默认构建可用；xhamster / wsj **仅高级构建**（见 `ja3-sites.ts`）。  
详见 `docs/YTDLP_LIVE_SMOKE_RESULTS.md` / `docs/YTDLP_PROTOCOL_POLICY.md`。

## InfoExtractor 方法面

见 `docs/YTDLP_IE_METHOD_SURFACE.md`（`gen-ie-method-surface.mjs` 生成）。

## P2 best-effort 明细（保留，非阻塞）

### `hand-b/bandcamp.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 48 | BandcampIE | JSONP 外层 `{...}` 提取 — 已够用 |

### `hand-b/bbc.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 66 | BBCCoUkIE | JSON 内 vpid 递归搜索 — 已够用 |

### `hand-c/_helpers.ts`（2）

| 行 | IE | 说明 |
|----|-----|------|
| 62 | _helpers | YouTube embed URL 扫描 |
| 88 | _helpers | XML 标签文本 |

### `hand-c/cinemax.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 4 | CinemaxIE | 上游 `_WORKING=False`；best-effort 与上游一致 |

### `hand-d/dplay.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 5 | DPlayBaseIE | Premium cookie 登录 — expected 错误 |

### `hand-s/skeb.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 32 | SkebIE | Cookie jar best-effort |

### `hand-v/vk.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 83 | VKBaseIE | JS salt 空回退 |

### `hand-w/_helpers.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 60 | _helpers | XML 首标签文本 |

### `hand-w/webcaster.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 82 | WebcasterIE | 网页扫描辅助 |

### `hand-w/weibo.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 86 | WeiboBaseIE | guest cookies best-effort |

### `hand-z/zingmp3.ts`（1）

| 行 | IE | 说明 |
|----|-----|------|
| 95 | ZingMp3BaseIE | 上游未实现 API 路径 — expected throw |

## RTMP / WebSocket

策略见 `protocol-policy.ts` + `docs/YTDLP_PROTOCOL_POLICY.md`。远期：`rtmp_ffmpeg` → 系统 ffmpeg 拉流。

## 验收规则

- 每站冒烟 OK → 从本清单删除对应 P1 行（best-effort 保留）
- 不扩 hand 批次除非上游新增 IE
