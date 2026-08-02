/**
 * LSMLREmbedIE / LSMLTVEmbedIE / LSMReplayIE — ported from yt-dlp lsm.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, js_to_json, parse_qs, str_or_none, url_or_none } from '../../utils';
import { parse_iso8601, urljoin } from './_helpers';

export class LSMLREmbedIE extends InfoExtractor {
  static IE_NAME = 'lsm:lr:embed';
  static _VALID_URL =
    /https?:\/\/(?:(?:latvijasradio|lr1|lr2|klasika|lr4|naba|radioteatris)\.lsm|pieci)\.lv\/[^/?#]+\/(?:pleijeris|embed)\/?\?(?:[^#]+&)?(?:show|id)=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const videoId = str_or_none(qs.show?.[0] || qs.id?.[0]) || this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const match = webpage.match(/LR\.audio\.Player\s*\([^{]*(?<player>\{.*?\}),(?<media>\{.*\})\);/);
    if (!match?.groups?.player || !match.groups.media) {
      throw new ExtractorError('Unable to extract player json');
    }

    const playerJson = this._parse_json<Record<string, unknown>>(js_to_json(match.groups.player), videoId, null, false) || {};
    const mediaJson = this._parse_json<Record<string, unknown>>(js_to_json(match.groups.media), videoId)!;

    const entries: VideoInfo[] = [];
    for (const kind of ['audio', 'video'] as const) {
      for (const item of (mediaJson[kind] as Array<Record<string, unknown>>) || []) {
        if (!item.id) continue;
        const formats: Format[] = [];
        for (const source of (item.sources as Array<Record<string, unknown>>) || []) {
          const file = url_or_none(source.file);
          if (!file) continue;
          if (determine_ext(file) === 'm3u8') {
            formats.push(...(await this._extract_m3u8_formats(file, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
          } else {
            formats.push({ format_id: 'http', url: file });
          }
        }

        let title = str_or_none(item.title);
        const id = String(item.id);
        if (id.startsWith('v') && !title) {
          const audioTitle = (mediaJson.audio as Array<Record<string, unknown>>)?.find((a) => String(a.id).slice(1) === id.slice(1));
          if (audioTitle?.title) title = `${audioTitle.title} - Video Version`;
        }

        entries.push({
          formats,
          thumbnail: playerJson.poster ? urljoin(url, String(playerJson.poster)) : undefined,
          id,
          title: title ?? id,
          duration: int_or_none(item.duration) ?? undefined,
        });
      }
    }

    if (entries.length === 1) return entries[0]!;
    return this.playlist_result(entries, videoId);
  }
}

export class LSMLTVEmbedIE extends InfoExtractor {
  static IE_NAME = 'lsm:ltv:embed';
  static _VALID_URL = /https?:\/\/ltv\.lsm\.lv\/embed\?(?:[^#]+&)?c=(?<id>[^#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = decodeURIComponent(this._match_id(url));
    const webpage = await this._download_webpage(url, videoId);
    const data = this._search_json(/window\.ltvEmbedPayload\s*=/, webpage, 'embed json', videoId) as Record<string, unknown>;
    const source = (data.source as Record<string, unknown>) || {};
    const embedType = str_or_none(source.name);

    let ieKey = 'Generic';
    let embedUrl = '';
    if (embedType === 'backscreen' || embedType === 'telia') {
      ieKey = 'CloudyCDN';
      embedUrl = url_or_none(source.embed_url) || '';
    } else if (embedType === 'youtube') {
      ieKey = 'Youtube';
      embedUrl = str_or_none(source.id) || '';
    } else {
      throw new ExtractorError(`Unsupported embed type '${embedType}'`);
    }

    const parentInfo = (data.parentInfo as Record<string, unknown>) || {};
    return {
      ...this.url_result(embedUrl, ieKey, videoId, str_or_none(parentInfo.title) ?? undefined),
      duration: int_or_none(parentInfo.duration) ?? undefined,
      thumbnail: url_or_none(source.poster) ?? undefined,
    };
  }
}

export class LSMReplayIE extends InfoExtractor {
  static IE_NAME = 'lsm:replay';
  static _VALID_URL =
    /https?:\/\/replay\.lsm\.lv\/[^/?#]+\/(?:skaties\/|klausies\/)?(?:ieraksts|statja)\/[^/?#]+\/(?<id>\d+)/;

  protected _fixNuxtData(webpage: string): string {
    return webpage.replace(/Object\.create\(null(?:,(\{.+\}))?\)/g, (_m, g1) => g1 || 'null');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const fixed = this._fixNuxtData(webpage);
    const data = this._search_json(/<script[^>]+id="__NUXT_DATA__"[^>]*>/, fixed, 'nuxt data', videoId) as Record<
      string,
      unknown
    >;
    const playback = (data.playback as Record<string, unknown>) || {};
    const playbackType = String(playback.type ?? '');
    const mediaItem = (data.mediaItem as Record<string, unknown>) || {};

    let playbackData: Partial<VideoInfo> = {};
    if (playbackType === 'playable_audio_lr') {
      const service = (playback.service as Record<string, unknown>) || {};
      playbackData = {
        formats: await this._extract_m3u8_formats(String(service.hls_url ?? ''), videoId),
      };
    } else if (playbackType === 'embed') {
      playbackData = {
        _type: 'url_transparent',
        url: String((playback.service as Record<string, unknown>)?.url ?? ''),
      };
    } else {
      throw new ExtractorError(`Unsupported playback type "${playbackType}"`);
    }

    return {
      id: videoId,
      ...playbackData,
      title: str_or_none(mediaItem.title) ?? videoId,
      description: str_or_none(mediaItem.lead || mediaItem.body) ?? undefined,
      duration: int_or_none(mediaItem.duration) ?? undefined,
      timestamp: parse_iso8601(mediaItem.aired_at) ?? undefined,
      thumbnail: url_or_none(mediaItem.largeThumbnail) ?? undefined,
    };
  }
}
