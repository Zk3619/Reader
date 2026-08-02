/**
 * TV5MondePlusIE — ported from yt-dlp tv5mondeplus.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  get_element_by_class,
  int_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';

export class TV5MondePlusIE extends InfoExtractor {
  static IE_NAME = 'TV5MONDE';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv5monde\.com\/tv\/video\/(?<id>[^/?#]+)/;

  protected _extractSubtitles(dataCaptions: unknown): Record<string, Subtitle[]> {
    const subtitles: Record<string, Subtitle[]> = {};
    const files = traverse_obj(dataCaptions, ['files']) as unknown[];
    if (!Array.isArray(files)) return subtitles;
    for (const f of files) {
      if (!f || typeof f !== 'object') continue;
      const rec = f as Record<string, unknown>;
      const fileUrl = url_or_none(rec.file);
      if (!fileUrl) continue;
      const lang = rec.label != null ? String(rec.label) : 'fra';
      (subtitles[lang] ||= []).push({ url: fileUrl, ext: determine_ext(fileUrl) || 'vtt' });
    }
    return subtitles;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    if (webpage.includes(">Ce programme n'est malheureusement pas disponible pour votre zone géographique.<")) {
      this.raise_geo_restricted(undefined, ['FR']);
    }

    const loaderMatch = webpage.match(/<[^>]+class="video_player_loader"[^>]+>/);
    const vplData = extract_attributes(loaderMatch?.[0] || '');

    const videoFiles = this._parse_json<Record<string, unknown>[]>(vplData['data-broadcast'] || '[]', displayId);
    const formats: Format[] = [];
    let videoId: string | undefined;

    const processFiles = async (files: Record<string, unknown>[]) => {
      for (const videoFile of files) {
        let vUrl = videoFile.url != null ? String(videoFile.url) : '';
        if (!vUrl) continue;
        if (videoFile.type === 'application/deferred') {
          const token = videoFile.token != null ? String(videoFile.token) : '';
          if (!token) continue;
          const dParam = encodeURIComponent(vUrl);
          const deferred = await this._download_json<Record<string, unknown>[]>(
            `https://api.tv5monde.com/player/asset/${dParam}/resolve?condenseKS=true`,
            displayId,
            undefined,
            { headers: { Authorization: `Bearer ${token}` }, fatal: false },
          );
          vUrl = url_or_none(deferred?.[0]?.url) || '';
          if (!vUrl) continue;
          videoId =
            this._search_regex(/materials\/([\da-zA-Z]{10}_[\da-fA-F]{7})\//, vUrl, 'video id', null, false, 1) ||
            videoId;
          if (Array.isArray(deferred)) await processFiles(deferred);
          continue;
        }
        const videoFormat = (videoFile.format != null ? String(videoFile.format) : '') || determine_ext(vUrl);
        if (videoFormat === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              vUrl,
              displayId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else if (videoFormat === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(vUrl, displayId, undefined, undefined, false)));
        } else {
          formats.push({ url: vUrl, format_id: videoFormat });
        }
      }
    };

    await processFiles(videoFiles || []);

    const metadata =
      this._parse_json<Record<string, unknown>>(vplData['data-metadata'] || '{}', displayId, null, false) || {};
    const content = (metadata.content as Record<string, unknown>) || {};

    if (!videoId) {
      videoId =
        this._search_regex(
          /data-guid=["']([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/,
          webpage,
          'video id',
          null,
          false,
          1,
        ) ||
        this._search_regex(/id_contenu["']\s*:\s*(\d+)/, webpage, 'video id', null, false, 1) ||
        displayId;
    }

    const epSummary = get_element_by_class('ep-summary', webpage) || '';
    const textEl = get_element_by_class('text', epSummary);

    return {
      id: videoId,
      display_id: displayId,
      title: clean_html(get_element_by_class('main-title', webpage) || '') || undefined,
      description: clean_html(textEl || '') || undefined,
      thumbnail: url_or_none(vplData['data-image']) || undefined,
      episode: content.title != null ? String(content.title) : undefined,
      series: content.series != null ? String(content.series) : undefined,
      timestamp: int_or_none(content.publishDate_ts) ?? undefined,
      duration: int_or_none(content.duration) ?? undefined,
      formats,
      subtitles: this._extractSubtitles(
        this._parse_json(vplData['data-captions'] || '{}', displayId, null, false),
      ),
    };
  }
}
