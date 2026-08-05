# yt-dlp 真 URL 冒烟结果

> 生成时间：2026-08-05
> 命令：`YTDLP_LIVE_SMOKE=1 npx vitest run src/test/lib/download/ytdlp-live-smoke.test.ts`

## 第一轮（未指定 ie_key — 错误匹配 Patreon）

| 站点 | 结果 | 详情 |
|------|------|------|
| xhamster | FAIL | Patreon 误匹配 → patreon API fetch failed |
| wsj | FAIL | NBCStations 误匹配 → fetch failed |
| tube8 | FAIL | Patreon 误匹配 |
| zdf-channel | FAIL | Patreon 误匹配 |

**修复**：`live-smoke-runner.ts` 为每站显式传入 `ie_key`（注册名：`XHamster` / `WSJ` / `Tube8` / `ZDFChannel`）。

## 第二轮（指定 ie_key — IE 路由正确）

环境：vitest 纯 Node · 无 Tauri · 无代理 · 约 118s

| 站点 | 结果 | IE 路由 | 详情 |
|------|------|---------|------|
| xhamster | FAIL | XHamster ✅ | `fetch failed`（网络/反爬；非误匹配） |
| wsj | FAIL | WSJ ✅ | `video-api.wsj.com` fetch failed |
| tube8 | FAIL | Tube8 ✅ | `tube8.com` fetch failed |
| zdf-channel | FAIL | ZDFChannel ✅ | `zdf-prod-futura.zdf.de/token` fetch failed |
| AES HLS | PASS | 单元 fixture | `hls-native` EXT-X-KEY 离线 ✅ |

**结论**：IE 键与提取链已对齐；联网失败为环境层 `TypeError: fetch failed`（Node undici），非解析逻辑错误。

## 第三轮（Tauri 桌面 — 2026-08-05）

环境：`npm run tauri:dev:lite` · DevTools · Client-Hints（当时尚未按构建拆分）

| 站点 | 结果 | 说明 |
|------|------|------|
| xhamster | OK* | 后改为：**默认不支持**，需 `tauri:dev:enhanced` |
| wsj | OK* | 后改为：**默认不支持**，需 `tauri:dev:enhanced` |
| tube8 | OK | AES flashvars；默认构建仍支持 |
| zdf-channel | OK | playlist；默认构建仍支持 |
| AES HLS | OK | 离线 fixture |

## 构建策略（2026-08-05 起）

| 构建 | xhamster / wsj | tube8 / ZDF | 进程内 wreq JA3 |
|------|----------------|-------------|-----------------|
| `tauri:dev:lite` | 不支持（明确报错） | 支持 | 不编译 |
| `tauri:dev:enhanced` | 支持 | 支持 | `--features tls-impersonate`（可 `READER_SKIP_TLS_IMPERSONATE=1` 跳过） |

## 备注

- vitest 纯 Node 易 `fetch failed`；以 Tauri 为准。
- 政策：`networking/ja3-sites.ts` + `docs/YTDLP_PROTOCOL_POLICY.md`。
