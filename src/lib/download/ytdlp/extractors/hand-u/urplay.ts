// @ts-nocheck
/** URPlayIE â€?ported from yt-dlp urplay.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  dict_get,
  int_or_none,
  traverse_obj,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parse_age_limit, searchNextjsData } from './_helpers';

function parseLangCode(code: string | null | undefined): string | undefined {
  if (code == null) return undefined;
  const lang = code.toLowerCase();
  // pragmatic ISO639 subset â€?pass through 2/3-letter codes
  if (/^[a-z]{2,3}$/.test(lang)) return lang;
  return undefined;
}

export class URPlayIE extends InfoExtractor {
  static IE_NAME = 'urplay';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ur(?:play|skola)\.se\/(?:program|Produkter)\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    url = url.replace('skola.se/Produkter', 'play.se/program');
    const webpage = await this._download_webpage(url, videoId);

    let urplayerData: Record<string, unknown> | null = null;
    try {
      const props = searchNextjsData(this, webpage, videoId);
      urplayerData = traverse_obj(props, ['pageProps', 'productData']) as Record<string, unknown> | null;
      if (!urplayerData) throw new ExtractorError('Unable to parse __NEXT_DATA__');
    } catch {
      const reactProps = this._parse_json<Record<string, unknown>>(
        this._html_search_regex(
          /data-react-class="routes\/Product\/components\/ProgramContainer\/ProgramContainer"[^>]+data-react-props="(\{.+?\})"/,
          webpage,
          'urplayer data',
        )!,
        videoId,
      )!;
      const accessibleEpisodes = (reactProps.accessibleEpisodes as Array<Record<string, unknown>>) || [];
      urplayerData =
        accessibleEpisodes.find((e) => e.id === int_or_none(videoId)) || null;
      if (!urplayerData) throw new ExtractorError('Unable to extract episode data');
    }

    const episode = String(urplayerData.title || videoId);
    const sources = await this._download_json<Record<string, unknown>>(
      `https://media-api.urplay.se/config-streaming/v1/urplay/sources/${videoId}`,
      videoId,
      'Downloading streaming information',
    );
    const hlsUrl = url_or_none(traverse_obj(sources, ['sources', 'hls']));
    if (!hlsUrl) throw new ExtractorError('Unable to extract HLS URL');

    const { formats, subtitles: hlsSubs } = await extractM3u8FormatsAndSubtitles(
      this,
      hlsUrl,
      videoId,
      'hls',
    );
    const subtitles: Record<string, Subtitle[]> = { ...hlsSubs };

    const streamingInfo = (urplayerData.streamingInfo as Record<string, Record<string, unknown>>) || {};
    for (const stream of Object.values(streamingInfo)) {
      for (const [k, v] of Object.entries(stream || {})) {
        if (k === 'sd' || k === 'hd' || !v || typeof v !== 'object') continue;
        const langRaw = (v as Record<string, unknown>).language as string | undefined;
        const sttlUrl = (v as Record<string, unknown>).location as string | undefined;
        if (!sttlUrl) continue;
        const lang = parseLangCode(langRaw);
        if (!lang) continue;
        (subtitles[lang] ||= []).push({ ext: k, url: sttlUrl });
      }
    }

    const image = (urplayerData.image as Record<string, string>) || {};
    const thumbnails: Thumbnail[] = [];
    for (const [k, v] of Object.entries(image)) {
      const t: Thumbnail = { id: k, url: v };
      const wh = k.split('x');
      if (wh.length === 2) {
        t.width = int_or_none(wh[0]) ?? undefined;
        t.height = int_or_none(wh[1]) ?? undefined;
      }
      thumbnails.push(t);
    }

    const series = (urplayerData.series as Record<string, unknown>) || {};
    const seriesTitle =
      (dict_get(series, ['seriesTitle', 'title']) as string | null) ||
      (dict_get(urplayerData, ['seriesTitle', 'mainTitle']) as string | null) ||
      undefined;

    const ageRanges = (urplayerData.ageRanges as Array<Record<string, unknown>>) || [];
    const ageFrom = ageRanges.length
      ? Math.min(...ageRanges.map((a) => try_get(a, (x) => x.from as number) || 0))
      : undefined;

    return {
      id: videoId,
      title: seriesTitle ? `${seriesTitle} : ${episode}` : episode,
      description: urplayerData.description as string | undefined,
      thumbnails,
      timestamp: unified_timestamp(urplayerData.publishedAt) ?? undefined,
      series: seriesTitle,
      formats: formats as Format[],
      duration: int_or_none(urplayerData.duration) ?? undefined,
      categories: urplayerData.categories as string[] | undefined,
      tags: urplayerData.keywords as string[] | undefined,
      season: series.label as string | undefined,
      episode,
      episode_number: int_or_none(urplayerData.episodeNumber) ?? undefined,
      age_limit: ageFrom != null ? parse_age_limit(String(ageFrom)) : undefined,
      subtitles,
    };
  }
}
