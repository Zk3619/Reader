/** NovaEmbedIE / NovaIE — ported from yt-dlp nova.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, str_or_none, unified_strdate, url_or_none } from '../../utils';

export class NovaEmbedIE extends InfoExtractor {
  static IE_NAME = 'NovaEmbed';
  static _VALID_URL = /https?:\/\/media(?:tn)?\.cms\.nova\.cz\/embed\/(?<id>[^/?#&]+)/;

  protected async _processFormatList(
    formatList: unknown,
    videoId: string,
    formatId = '',
  ): Promise<{ formats: Format[]; hasDrm: boolean }> {
    const formats: Format[] = [];
    let hasDrm = false;
    const list = Array.isArray(formatList) ? formatList : formatList ? [formatList] : [];
    for (const formatDict of list) {
      if (!formatDict || typeof formatDict !== 'object') continue;
      const fd = formatDict as Record<string, unknown>;
      if (fd.drm && !this.params.allow_unplayable_formats) {
        hasDrm = true;
        continue;
      }
      const formatUrl = url_or_none(fd.src);
      const formatType = String(fd.type || '');
      const ext = determine_ext(formatUrl || '');
      if (formatType === 'application/x-mpegURL' || formatId === 'HLS' || ext === 'm3u8') {
        if (formatUrl) {
          formats.push(
            ...(await this._extract_m3u8_formats(formatUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        }
      } else if (formatType === 'application/dash+xml' || formatId === 'DASH' || ext === 'mpd') {
        if (formatUrl) {
          formats.push(...(await this._extract_mpd_formats(formatUrl, videoId, 'dash', undefined, false)));
        }
      } else if (formatUrl) {
        formats.push({ url: formatUrl, format_id: formatId || 'http' });
      }
    }
    return { formats, hasDrm };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    let hasDrm = false;
    let duration: number | undefined;
    let formats: Format[] = [];

    const playerJson = this._search_regex(
      /player:\s*(\{[\s\S]*?\})\s*;/,
      webpage,
      'player',
      null,
      false,
      1,
    );
    if (playerJson) {
      const player = this._parse_json<Record<string, unknown>>(playerJson, videoId)!;
      const lib = player.lib as Record<string, unknown> | undefined;
      const source = lib?.source as Record<string, unknown> | undefined;
      for (const src of (source?.sources as unknown[]) || []) {
        const { formats: fmts, hasDrm: drm } = await this._processFormatList(src, videoId);
        formats.push(...fmts);
        hasDrm = hasDrm || drm;
      }
      duration = int_or_none((player.sourceInfo as Record<string, unknown>)?.duration) ?? undefined;
    }

    if (!formats.length && !hasDrm) {
      const legacyMatch = webpage.match(/Player\.init\s*\([^,]+,\s*(\{[\s\S]+?\})\s*,/);
      if (legacyMatch) {
        const player = this._parse_json<Record<string, unknown>>(legacyMatch[1]!, videoId)!;
        for (const [fid, flist] of Object.entries((player.tracks as Record<string, unknown>) || {})) {
          const { formats: fmts, hasDrm: drm } = await this._processFormatList(flist, videoId, fid);
          formats.push(...fmts);
          hasDrm = hasDrm || drm;
        }
        duration = int_or_none(player.duration) ?? duration;
      }
    }

    if (!formats.length && hasDrm) this.report_warning(`DRM protected: ${videoId}`);

    const title =
      this._og_search_title(webpage) ||
      this._search_regex(/<value>([^<]+)/, webpage, 'title', null, false) ||
      videoId;
    const thumbnail =
      this._og_search_thumbnail(webpage) ||
      this._search_regex(/poster\s*:\s*["']([^"']+)/, webpage, 'thumbnail', null, false) ||
      undefined;
    duration =
      int_or_none(this._search_regex(/videoDuration\s*:\s*(\d+)/, webpage, 'duration', null, false)) ??
      duration;

    return { id: videoId, title, thumbnail, duration, formats };
  }
}

export class NovaIE extends InfoExtractor {
  static IE_NAME = 'Nova';
  static IE_DESC = 'TN.cz, Prásk.tv, Nova.cz, Novaplus.cz, FANDA.tv, Krásná.cz and Doma.cz';
  static _VALID_URL =
    /https?:\/\/(?:[^.]+\.)?(?<site>tv(?:noviny)?|tn|novaplus|vymena|fanda|krasna|doma|prask)\.nova\.cz\/(?:[^/]+\/)+(?<id>[^/]+?)(?:\.html|\/|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const displayId = m?.groups?.id ?? this._match_id(url);
    const site = m?.groups?.site ?? '';
    const webpage = await this._download_webpage(url, displayId);

    const description = clean_html(this._og_search_description(webpage) || undefined) || undefined;
    let uploadDate: string | undefined;
    if (site === 'novaplus') {
      uploadDate = unified_strdate(this._search_regex(/(\d{1,2}-\d{1,2}-\d{4})$/, displayId, 'upload date', null, false) || undefined) ?? undefined;
    } else if (site === 'fanda') {
      uploadDate =
        unified_strdate(
          this._search_regex(/<span class="date_time">(\d{1,2}\.\d{1,2}\.\d{4})/, webpage, 'upload date', null, false) ||
            undefined,
        ) ?? undefined;
    }

    const embedId = this._search_regex(
      /<iframe[^>]+\bsrc=["'](?:https?:)?\/\/media(?:tn)?\.cms\.nova\.cz\/embed\/([^/?#"']+)/,
      webpage,
      'embed url',
      null,
      false,
    );
    if (embedId) {
      return {
        _type: 'url_transparent',
        url: `https://media.cms.nova.cz/embed/${embedId}`,
        ie_key: 'NovaEmbed',
        id: embedId,
        description,
        upload_date: uploadDate,
      };
    }

    const videoId =
      this._search_regex(
        /(?:media|video_id)\s*:\s*'(\d+)'|media=(\d+)|id="article_video_(\d+)"|id="player_(\d+)"/,
        webpage,
        'video id',
      ) || displayId;

    let configUrl = this._search_regex(
      /src="(https?:\/\/(?:tn|api)\.nova\.cz\/bin\/player\/videojs\/config\.php\?[^"]+)"/,
      webpage,
      'config url',
      null,
      false,
    );
    let configParams: Record<string, string | number> = {};

    if (!configUrl) {
      const playerMatch = webpage.match(/Player\s*\(.+?\s*,\s*(\{.+?\bmedia\b["']?\s*:\s*["']?\d+.+?\})\s*\)/s);
      if (playerMatch) {
        const player = this._parse_json<Record<string, unknown>>(playerMatch[1]!, videoId)!;
        configUrl = url_or_none(player.configUrl) ?? null;
        if (player.configParams && typeof player.configParams === 'object') {
          configParams = player.configParams as Record<string, string | number>;
        }
      }
    }

    if (!configUrl) {
      const SITES: Record<string, string> = {
        tvnoviny: '23000',
        novaplus: '23000',
        vymena: '23000',
        krasna: '23000',
        fanda: '30',
        tn: '30',
        doma: '30',
      };
      const siteId = this._search_regex(/site=(\d+)/, webpage, 'site id', null, false) || SITES[site] || '23000';
      configUrl = 'https://api.nova.cz/bin/player/videojs/config.php';
      configParams = { site: siteId, media: videoId, quality: 3, version: 1 };
    }

    const rawConfig = await this._download_webpage(configUrl!, displayId, undefined, { query: configParams as Record<string, string> });
    const jsonStart = rawConfig.indexOf('{');
    const jsonEnd = rawConfig.lastIndexOf('}');
    const config = this._parse_json<{ mediafile?: Record<string, unknown>; poster?: string }>(
      rawConfig.slice(jsonStart, jsonEnd + 1),
      displayId,
    )!;
    const mediafile = (config.mediafile || {}) as Record<string, unknown>;
    const videoUrl = String(mediafile.src ?? '');

    let formats: Format[] = [];
    const rtmp = videoUrl.match(/^(?<url>rtmpe?:\/\/[^/]+\/(?<app>[^/]+?))\/&*(?<playpath>.+)$/);
    if (rtmp?.groups) {
      formats = [
        {
          url: rtmp.groups.url,
          format_id: 'rtmp',
          ext: 'flv',
          app: rtmp.groups.app,
          play_path: rtmp.groups.playpath,
        } as Format,
      ];
    } else if (videoUrl) {
      formats = [{ url: videoUrl, format_id: 'http' }];
    }

    const meta = (mediafile.meta as Record<string, unknown>) || {};
    return {
      id: videoId,
      display_id: displayId,
      title: str_or_none(meta.title) || this._og_search_title(webpage) || displayId,
      description,
      upload_date: uploadDate,
      thumbnail: config.poster,
      formats,
    };
  }
}
