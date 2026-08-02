/**
 * DailyWire family — ported from yt-dlp dailywire.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, float_or_none, join_nonempty, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, searchNextjsData } from './_helpers';

type SitesType = 'episode' | 'videos' | 'podcasts';

const JSON_PATH: Record<SitesType, string[]> = {
  episode: ['pageProps', 'episodeData', 'episode'],
  videos: ['pageProps', 'videoData', 'video'],
  podcasts: ['pageProps', 'episode'],
};

export class DailyWireBaseIE extends InfoExtractor {
  static IE_NAME = 'dailywirebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DailyWireBaseIE is not a standalone extractor', { expected: true });
  }

  protected async getJson(url: string): Promise<[string, Record<string, unknown>]> {
    const m = this._match_valid_url(url)!;
    const sitesType = m.groups!.sites_type as SitesType;
    const slug = m.groups!.id || m.groups!.podcaster || '';
    const webpage = await this._download_webpage(url, slug);
    const props = searchNextjsData(this, webpage, slug);
    let cur: unknown = props;
    for (const key of JSON_PATH[sitesType]) {
      cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined;
    }
    return [slug, (cur as Record<string, unknown>) || {}];
  }
}

export class DailyWireIE extends DailyWireBaseIE {
  static IE_NAME = 'dailywire';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dailywire(?:\.com)\/(?<sites_type>episode|videos)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [slug, episodeInfo] = await this.getJson(url);
    const urls: string[] = [];

    const segments = episodeInfo.segments;
    if (Array.isArray(segments)) {
      for (const seg of segments) {
        if (seg && typeof seg === 'object') {
          const v = (seg as Record<string, unknown>).video;
          const a = (seg as Record<string, unknown>).audio;
          if (typeof v === 'string') urls.push(v);
          if (typeof a === 'string') urls.push(a);
        }
      }
    }
    const videoUrl = episodeInfo.videoUrl;
    if (typeof videoUrl === 'string') urls.push(videoUrl);
    const nestedVideo = (episodeInfo.video as Record<string, unknown> | undefined)?.audio;
    if (typeof nestedVideo === 'string') urls.push(nestedVideo);

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const mediaUrl of urls.filter(Boolean)) {
      if (determine_ext(mediaUrl) !== 'm3u8') {
        formats.push({ format_id: 'http', url: mediaUrl });
        continue;
      }
      const res = await extractM3u8FormatsAndSubtitles(this, mediaUrl, slug);
      formats.push(...res.formats);
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }

    const createdBy = (episodeInfo.createdBy as Record<string, unknown>) || {};
    return {
      id: String(episodeInfo.id ?? slug),
      display_id: slug,
      title: String(episodeInfo.title ?? episodeInfo.name ?? slug),
      description: (episodeInfo.description as string) ?? undefined,
      creator: join_nonempty(
        String(createdBy.firstName ?? ''),
        String(createdBy.lastName ?? ''),
        ' ',
      ) || undefined,
      duration: float_or_none(episodeInfo.duration) ?? undefined,
      is_live: (episodeInfo.isLive as boolean) ?? undefined,
      thumbnail:
        url_or_none(episodeInfo.thumbnail) || url_or_none(episodeInfo.image) || undefined,
      formats,
      subtitles,
      series_id: ((episodeInfo.show as Record<string, unknown>) || {}).id as string | undefined,
      series: ((episodeInfo.show as Record<string, unknown>) || {}).name as string | undefined,
    };
  }
}

export class DailyWirePodcastIE extends DailyWireBaseIE {
  static IE_NAME = 'dailywire:podcast';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dailywire(?:\.com)\/(?<sites_type>podcasts)\/(?<podcaster>[\w-]+\/(?<id>[\w-]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [slug, episodeInfo] = await this.getJson(url);
    const audioId =
      (episodeInfo.audioMuxPlaybackId as string) ||
      'VUsAipTrBVSgzw73SpC2DAJD401TYYwEp';
    return {
      id: String(episodeInfo.id ?? slug),
      url: `https://stream.media.dailywire.com/${audioId}/audio.m4a`,
      display_id: slug,
      title: (episodeInfo.title as string) ?? undefined,
      duration: float_or_none(episodeInfo.duration) ?? undefined,
      thumbnail: (episodeInfo.thumbnail as string) ?? undefined,
      description: (episodeInfo.description as string) ?? undefined,
    };
  }
}
