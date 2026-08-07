# yt-dlp InfoExtractor 方法面对照

> 刷新：2026-08-08（P5-2 IE common → 100%）  
> 生成器：`node src/lib/download/ytdlp/port/gen-ie-method-surface.mjs`（可再跑核对）

| 指标 | 说明 |
|------|------|
| 能力验收 | **IE common = 100%**（相对上游 `extractor/common.py` 用户可见方法面；实现可在 `common.ts` + `ie-common/`） |
| 微 OUT | 交互登录（密码/短信/人工 2FA）不在 IE common 分母 |

## 本轮补齐（P5-2）

| 面 | 模块 / 方法 |
|----|-------------|
| XML | `_parse_xml` · `_download_xml` · `_download_xml_handle` · `ie-common/xml.ts` |
| MPD | `_parse_mpd_periods` · `_parse_mpd_formats*` · `_merge_mpd_periods` · SegmentTemplate/`$Number$` · `ie-common/mpd.ts` |
| SMIL | `_download_smil` · `_parse_smil*` · `_extract_smil_formats_and_subtitles` · `ie-common/smil.ts` |
| HLS parse-only | `_parse_m3u8_formats*` · `_parse_m3u8_vod_duration` · `ie-common/m3u8-parse.ts` |
| XSPF | `_extract_xspf_playlist` · `_parse_xspf` · `ie-common/xspf.ts` |
| embeds | `_extract_embed_urls` · `_extract_url` |
| hooks | `_get_comments` · `extract_comments` · `_get_subtitles` · `_get_automatic_captions` · `_mark_watched` · `CommentsDisabled` |
| helpers | `_int` · `_float` · `_availability` · `_generic_title` · `_is_valid_url` · `_og_search_url` · `_create_request` · `_cookies_passed` · `_merge_subtitle_items` |

此前已有：JWPlayer / Akamai / Wowza / chapters · m3u8/mpd/ism/f4m extract · geo/cookies · html5 media 等。

## 非缺口 / 内部

- `__init_subclass__` / plugin wrap、`LazyList`、CLI-only 打印路径等不算能力缺口
- 站点私有 camelCase（hand-*）不计入 common 表面
- 下载编排在 `youtube-dl.ts`；协议策略见 `YTDLP_PROTOCOL_POLICY.md`

## 单测

`src/test/lib/download/ytdlp-ie-common.test.ts`
