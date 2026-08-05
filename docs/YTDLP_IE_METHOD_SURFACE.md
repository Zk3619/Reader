# yt-dlp InfoExtractor 方法面对照

> 自动生成：node src/lib/download/ytdlp/port/gen-ie-method-surface.mjs

| 指标 | Python common.py | Reader common.ts |
|------|------------------|------------------|
| 类方法（def） | 173 | 59 |
| 核心 IE 方法 | 135 | 46 |
| 已移植核心方法 | 45 | — |
| 未移植核心方法 | 90 | — |
| Reader 扩展 | — | 1 |

## 已移植核心方法（45）

- _check_formats
- _configuration_arg
- _download_webpage
- _download_webpage_handle
- _extract_f4m_formats
- _extract_ism_formats
- _extract_ism_formats_and_subtitles
- _extract_m3u8_formats
- _extract_m3u8_formats_and_subtitles
- _extract_mpd_formats
- _extract_mpd_formats_and_subtitles
- _extract_smil_formats
- _form_hidden_inputs
- _generic_id
- _get_cookies
- _get_login_info
- _get_netrc_login_info
- _hidden_inputs
- _html_extract_title
- _html_search_meta
- _html_search_regex
- _live_title
- _match_id
- _match_valid_url
- _merge_subtitles
- _og_search_description
- _og_search_property
- _og_search_thumbnail
- _og_search_title
- _og_search_video_url
- _parse_html5_media_entries
- _proto_relative_url
- _real_extract
- _remove_duplicate_formats
- _request_webpage
- _search_json_ld
- _search_regex
- _set_cookie
- _sleep
- _sort_formats
- _yes_playlist
- extract
- playlist_result
- suitable
- url_result

## 未移植核心方法（90，节选）

- _RETURN_TYPE
- _VALID_URL
- __can_accept_status_code
- __check_blocked
- __create_download_methods
- __decode_webpage
- __init__
- __init_subclass__
- __maybe_fake_ip_and_retry
- __print_error
- _apply_first_set_cookie_header
- _availability
- _cookies_passed
- _create_request
- _dc_search_uploader
- _download_smil
- _error_or_warning
- _extract_akamai_formats
- _extract_akamai_formats_and_subtitles
- _extract_chapters_from_description
- _extract_chapters_helper
- _extract_embed_urls
- _extract_from_webpage
- _extract_generic_embeds
- _extract_jwplayer_data
- _extract_m3u8_vod_duration
- _extract_mpd_periods
- _extract_mpd_vod_duration
- _extract_smil_formats_and_subtitles
- _extract_smil_info
- _extract_url
- _extract_wowza_formats
- _extract_xspf_playlist
- _family_friendly_search
- _find_jwplayer_data
- _float
- _generic_title
- _get_automatic_captions
- _get_comments
- _get_n_results
- _get_subtitles
- _get_tfa_info
- _guess_encoding_from_content
- _initialize_geo_bypass
- _initialize_pre_login
- _int
- _is_valid_url
- _json_ld
- _login_hint
- _m3u8_meta_format
- _mark_watched
- _media_rating_search
- _merge_mpd_periods
- _merge_subtitle_items
- _meta_regex
- _og_regexes
- _og_search_url
- _parse_f4m_formats
- _parse_ism_formats_and_subtitles
- _parse_json

… 另有 30 项（多为站点专用或 LazyList 内部）

## Reader 扩展方法

- _ported_real_extract

## 说明

- hand-* IE 内 camelCase 方法（如 _callApi）为站点私有实现，不计入 common 表面。
- 下载编排（break_on_existing / playlist_items / download_archive）在 youtube-dl.ts。
- RTMP/WebSocket 见 protocol-policy.ts；HDS bootstrap 见 f4m-native.ts。
