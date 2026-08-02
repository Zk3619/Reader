/** OnDemandKoreaIE / OnDemandKoreaProgramIE — ported from yt-dlp ondemandkorea.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  parse_qs,
  str_or_none,
  traverse_obj,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { parse_age_limit } from './_helpers';

function tryGeoBypass(rawUrl: string): string {
  const qs = parse_qs(rawUrl);
  return url_or_none(qs.stream_url?.[0]) || rawUrl;
}

export class OnDemandKoreaIE extends InfoExtractor {
  static IE_NAME = 'ondemandkorea';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ondemandkorea\.com\/(?:en\/)?player\/vod\/[a-z0-9-]+\?(?:[^#]+&)?contentId=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `https://odkmedia.io/odx/api/v3/playback/${videoId}/`,
      videoId,
      undefined,
      {
        fatal: false,
        headers: { 'service-name': 'odk' },
        query: { did: crypto.randomUUID() },
      },
    );

    if (!traverse_obj(data, 'result')) {
      const msg =
        (traverse_obj(data, ["messages", "__default"]) as string | undefined) ||
        (traverse_obj(data, 'title') as string | undefined);
      throw new ExtractorError(msg || 'Got empty response from playback API', { expected: true });
    }

    const result = data.result as Record<string, unknown>;
    const formats: Format[] = [];

    const sourceLists = [
      ...(traverse_obj(result, 'sources') as Array<Record<string, unknown>> | undefined) || [],
      ...(traverse_obj(result, 'manifest') as Array<Record<string, unknown>> | undefined) || [],
    ];
    for (const src of sourceLists) {
      const m3u8Url = tryGeoBypass(url_or_none(src.url) || '');
      if (!m3u8Url) continue;
      const modUrl = m3u8Url.replace(/_720(p?)\.m3u8/, '_1080$1.m3u8');
      if (modUrl !== m3u8Url) {
        const modFormat = await this._extract_m3u8_formats(
          modUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          'Checking for higher quality format',
          'hls',
          'No higher quality format found',
          false,
        );
        if (modFormat.length) {
          formats.push(...modFormat);
          continue;
        }
      }
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const track of (result.text_tracks as Array<Record<string, unknown>>) || []) {
      const trackUrl = url_or_none(track.url);
      if (!trackUrl) continue;
      const lang = String(track.language || 'und');
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({
        url: trackUrl,
        ext: String(track.codec || 'vtt'),
        name: track.label as string | undefined,
      });
    }

    const episode = (result.episode as Record<string, unknown>) || {};
    const isSeries = result.kind === 'series';
    const program = (episode.program as Record<string, unknown>) || {};
    const titleParts = [
      isSeries ? String(program.title ?? '') : '',
      String(episode.title ?? ''),
    ].filter(Boolean);

    return {
      id: videoId,
      title: titleParts.length > 1 ? titleParts.join(': ') : titleParts[0],
      thumbnail: url_or_none(traverse_obj(episode, ["images", "thumbnail"])) ?? undefined,
      release_date:
        unified_strdate(String(episode.release_date ?? '').replace(/-/g, '')) ?? undefined,
      duration: float_or_none(result.duration, 1000) ?? undefined,
      age_limit: parse_age_limit(String(traverse_obj(result, ["age_rating", "name"]) ?? '').replace('R', '')) ?? undefined,
      series: isSeries ? (program.title as string | undefined) : undefined,
      series_id: isSeries ? str_or_none(program.id) ?? undefined : undefined,
      episode: isSeries ? (episode.title as string | undefined) : undefined,
      episode_number: isSeries ? int_or_none(episode.number) ?? undefined : undefined,
      formats,
      subtitles,
    };
  }
}

export class OnDemandKoreaProgramIE extends InfoExtractor {
  static IE_NAME = 'ondemandkorea:program';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ondemandkorea\.com\/(?:en\/)?player\/vod\/(?<id>[a-z0-9-]+)(?:$|#)/;
  static _PAGE_SIZE = 100;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const entries: VideoInfo[] = [];

    for (let page = 1; ; page++) {
      const pageData = await this._download_json<Record<string, unknown>>(
        `https://odkmedia.io/odx/api/v3/program/${displayId}/episodes/`,
        displayId,
        `Downloading page ${page}`,
        {
          headers: { 'service-name': 'odk' },
          query: { page: String(page), page_size: String(OnDemandKoreaProgramIE._PAGE_SIZE) },
        },
      );
      const results = traverse_obj(pageData, ["result", "results"]) as Array<Record<string, unknown>> | undefined;
      if (!results?.length) break;
      for (const episode of results) {
        entries.push(
          this.url_result(
            `https://www.ondemandkorea.com/player/vod/${displayId}?contentId=${episode.id}`,
            'OnDemandKorea',
            String(episode.id),
            episode.title as string | undefined,
          ),
        );
      }
      if (results.length < OnDemandKoreaProgramIE._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, displayId);
  }
}
