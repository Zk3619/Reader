/**
 * ERR (Estonian Public Broadcasting) — ported from yt-dlp err.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

export class ERRJupiterIE extends InfoExtractor {
  static IE_NAME = 'errjupiter';
  static _VALID_URL = /https?:\/\/(?:jupiter(?:pluss)?|lasteekraan)\.err\.ee\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const response = await this._download_json<{ data: { mainContent: Record<string, unknown> } }>(
      'https://services.err.ee/api/v2/vodContent/getContentPageData',
      videoId,
      undefined,
      { query: { contentId: videoId } },
    );
    const data = response.data.mainContent;

    const medias = traverse_obj(data, ['medias'], { get_all: true }) as Record<string, unknown>[] | undefined;
    const mediaData = medias?.find((m) => m && typeof m === 'object') as Record<string, unknown> | undefined;
    if (traverse_obj(mediaData, ['restrictions', 'drm'])) {
      this.report_warning('DRM protected content');
    }

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const src = (mediaData?.src as Record<string, unknown>) || {};
    const hlsUrls = new Set(
      ['hls', 'hls2', 'hlsNew']
        .map((k) => url_or_none(src[k]))
        .filter(Boolean) as string[],
    );
    for (const hlsUrl of hlsUrls) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    for (const dashKey of ['dash', 'dashNew'] as const) {
      const dashUrl = url_or_none(src[dashKey]);
      if (!dashUrl) continue;
      formats.push(...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)));
    }
    const fileUrl = url_or_none(src.file);
    if (fileUrl) formats.push({ url: fileUrl, format_id: 'http' });

    const episodeMeta =
      data.type === 'episode'
        ? {
            series: str_or_none(data.heading) ?? undefined,
            series_id: str_or_none(data.rootContentId) ?? undefined,
            episode: str_or_none(data.subHeading) ?? undefined,
            season_number: int_or_none(data.season) ?? undefined,
            episode_number: int_or_none(data.episode) ?? undefined,
            episode_id: str_or_none(data.id) ?? undefined,
          }
        : {};

    const lead = str_or_none(data.lead);
    const body = str_or_none(data.body);
    const description = [lead, body].filter(Boolean).map((h) => clean_html(h)).filter(Boolean).join('\n') || undefined;

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(data.heading) ?? undefined,
      alt_title: str_or_none(data.subHeading) ?? undefined,
      description,
      timestamp: int_or_none(data.created) ?? undefined,
      modified_timestamp: int_or_none(data.updated) ?? undefined,
      release_timestamp: int_or_none(data.scheduleStart ?? data.publicStart) ?? undefined,
      release_year: int_or_none(data.year) ?? undefined,
      ...episodeMeta,
    };
  }
}

export class ERRArhiivIE extends InfoExtractor {
  static IE_NAME = 'errarhiiv';
  static _VALID_URL = /https?:\/\/arhiiv\.err\.ee\/video\/(?:vaata\/)?(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `https://arhiiv.err.ee/api/v1/content/video/${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const media = (data.media as Record<string, unknown>) || {};
    const src = (media.src as Record<string, unknown>) || {};

    const hlsUrl = url_or_none(src.hls);
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    const dashUrl = url_or_none(src.dash);
    if (dashUrl) {
      formats.push(...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)));
    }

    const info = (data.info as Record<string, unknown>) || {};
    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(info.title) ?? undefined,
      series: str_or_none(info.seriesTitle) ?? undefined,
      series_id: str_or_none(info.seriesId) ?? undefined,
      episode_id: str_or_none(info.episode) ?? undefined,
      description: str_or_none(info.synopsis) ?? undefined,
      timestamp: parseIso8601(info.uploadDate) ?? undefined,
      modified_timestamp: parseIso8601(info.dateModified) ?? undefined,
      release_timestamp: parseIso8601(info.date) ?? undefined,
      release_year: int_or_none(info.year) ?? undefined,
    };
  }
}
