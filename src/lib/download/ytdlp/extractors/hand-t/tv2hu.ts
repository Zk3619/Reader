/**
 * TV2HuIE / TV2HuSeriesIE — ported from yt-dlp tv2hu.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, protoRelative } from './_helpers';

export class TV2HuIE extends InfoExtractor {
  static IE_NAME = 'tv2play.hu';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv2play\.hu\/(?!szalag\/)(?<id>[^#&?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const jsonData = await this._download_json<Record<string, unknown>>(
      `https://tv2play.hu/api/search/${slug}`,
      slug,
    );

    if (jsonData.contentType === 'showpage') {
      const ribbonIds = traverse_obj(jsonData, ['pages', 'tabs', 'ribbonIds']) as unknown;
      const ids = Array.isArray(ribbonIds)
        ? ribbonIds.flatMap((page) => {
            if (!page || typeof page !== 'object') return [];
            const tabs = (page as Record<string, unknown>).tabs;
            if (!Array.isArray(tabs)) return [];
            return tabs.flatMap((tab) => {
              const r = tab && typeof tab === 'object' ? (tab as Record<string, unknown>).ribbonIds : null;
              return Array.isArray(r) ? r.map(String) : [];
            });
          })
        : [];
      const entries = ids.map((ribbonId) =>
        this.url_result(`https://tv2play.hu/szalag/${ribbonId}`, 'TV2HuSeries', ribbonId),
      );
      return this.playlist_result(entries, slug);
    }

    if (jsonData.contentType !== 'video') {
      throw new ExtractorError(`Unsupported TV2 Hu content: ${String(jsonData.contentType)}`, { expected: true });
    }

    const videoId = String(jsonData.id);
    const playerId = jsonData.playerId;
    const seriesJson = (jsonData.seriesInfo as Record<string, unknown>) || {};
    const streamUrl = await this._download_json<{ url: string }>(
      `https://tv2play.hu/api/streaming-url?playerId=${playerId}`,
      videoId,
    );
    const videoJson = await this._download_json<Record<string, unknown>>(streamUrl.url, videoId);
    const m3u8Url = protoRelative(String(traverse_obj(videoJson, ['bitrates', 'hls']) || ''));
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId);

    const uploadedAt = jsonData.uploadedAt != null ? String(jsonData.uploadedAt).replace(/\./g, '') : undefined;

    return {
      id: videoId,
      title: String(jsonData.title || videoId),
      series: jsonData.seriesTitle != null ? String(jsonData.seriesTitle) : undefined,
      duration: jsonData.length != null ? Number(jsonData.length) || undefined : undefined,
      description: jsonData.description != null ? String(jsonData.description) : undefined,
      thumbnail: jsonData.thumbnailUrl ? `https://tv2play.hu${jsonData.thumbnailUrl}` : undefined,
      release_date: uploadedAt,
      season_number: seriesJson.seasonNr != null ? Number(seriesJson.seasonNr) || undefined : undefined,
      episode_number: seriesJson.episodeNr != null ? Number(seriesJson.episodeNr) || undefined : undefined,
      formats,
      subtitles,
    };
  }
}

export class TV2HuSeriesIE extends InfoExtractor {
  static IE_NAME = 'tv2playseries.hu';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv2play\.hu\/szalag\/(?<id>[^#&?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const jsonData = await this._download_json<{ cards?: Record<string, unknown>[] }>(
      `https://tv2play.hu/api/ribbons/${playlistId}/0?size=100000`,
      playlistId,
    );
    const entries = (jsonData.cards || [])
      .map((card) => (card.slug != null ? String(card.slug) : null))
      .filter(Boolean)
      .map((videoSlug) => this.url_result(`https://tv2play.hu/${videoSlug}`, 'TV2Hu', videoSlug!));
    return this.playlist_result(entries, playlistId);
  }
}
