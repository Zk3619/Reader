# Reader 影视 LOCAL HTTP API

对齐 [TV-fongmi/docs/LOCAL.md](../../TV-fongmi/docs/LOCAL.md) 的桌面子集。服务绑定 `127.0.0.1:9978–9998`。

获取 base：`invoke('tv_local_api_base_url')` → `http://127.0.0.1:{port}`

## 已实现

| 路径 | 说明 |
|------|------|
| `/` `/health` | `ok` |
| `/media` | 当前播放 JSON（前端 `tv_media_report`） |
| `/device` | 本机设备信息 JSON |
| `/cache?do=get\|set\|del` | 进程内 KV（爬虫共享） |
| `/proxy?do=http\|m3u8\|raw\|js\|py\|…` | 媒体/爬虫代理 |
| `/action?do=search` | 触发搜索 |
| `/action?do=push` | 推送播放 URL |
| `/action?do=setting` | 导入配置 URL |
| `/action?do=control` | play/pause/stop/replay/prev/next/repeat |
| `/action?do=danmaku` | 本地插入一条弹幕文字 |
| `/action?do=refresh` | player/detail/live/subtitle/danmaku |
| `/action?do=sync` | history/keep 多机同步（form body） |
| `/action?do=cast` | **降级为 push**（无 DLNA） |
| `/action?do=file` | 字幕路径注入 / 提示 |

## 同步约定

`POST /action?do=sync&type=history|keep&mode=0|1|2&force=true`

Body：`application/x-www-form-urlencoded`，字段 `device` / `targets` / `config` / `configs`（JSON 字符串）。

设置页可向对端 base URL 推送历史/收藏。

## 明确不做 / 弱实现

- 完整 `/file` `/upload` 文件系统浏览
- DLNA DMC/DMR（`cast` 仅 push）
- 与 FongMi History bean 字段 100% 同构（按 key 合并即可）
