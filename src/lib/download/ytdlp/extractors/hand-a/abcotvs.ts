/**
 * ABCOTVSIE / ABCOTVSClipsIE — aligned with yt-dlp abcotvs.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { dict_get, int_or_none, try_get } from '../../utils';

const SITE_MAP: Record<string, string> = {
  '6abc': 'wpvi',
  abc11: 'wtvd',
  abc13: 'ktrk',
  abc30: 'kfsn',
  abc7: 'kabc',
  abc7chicago: 'wls',
  abc7news: 'kgo',
  abc7ny: 'wabc',
};

export class ABCOTVSIE extends InfoExtractor {
  static IE_NAME = 'abcotvs';
  static IE_DESC = 'ABC Owned Television Stations';
  static _VALID_URL =
    /https?:\/\/(?<site>abc(?:7(?:news|ny|chicago)?|11|13|30)|6abc)\.com(?:(?:\/[^/]+)*\/(?<display_id>[^/]+))?\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    let displayId = m.groups!.display_id || m.groups!.id!;
    const videoId = m.groups!.id!;
    const station = SITE_MAP[site]!;

    const resp = await this._download_json<{ data: Record<string, unknown> }>(
      'https://api.abcotvs.com/v2/content',
      displayId,
      'Downloading ABCOTVS JSON',
      {
        query: {
          id: videoId,
          key: `otv.web.${station}.story`,
          station,
        },
      },
    );

    const data = resp.data;
    const video =
      (try_get(data, (x: Record<string, unknown>) => {
        const fm = x.featuredMedia as Record<string, unknown> | undefined;
        return fm?.video;
      }) as Record<string, unknown> | null) || data;

    const resolvedId = String(dict_get(video, ['id', 'publishedKey'], videoId));
    displayId = displayId || resolvedId;
    const title = String(video.title || video.linkText || resolvedId);

    const formats: Format[] = [];
    const m3u8 = video.m3u8 as string | undefined;
    if (m3u8) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8.split('?')[0]!,
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
    }
    const mp4 = video.mp4 as string | undefined;
    if (mp4) {
      formats.push({
        abr: 128,
        format_id: 'https',
        height: 360,
        url: mp4,
        width: 640,
      });
    }

    const image = (video.image as Record<string, unknown>) || {};

    return {
      id: resolvedId,
      display_id: displayId,
      title,
      description: String(
        dict_get(video, ['description', 'caption']) ||
          try_get(video, (x: Record<string, unknown>) => {
            const meta = x.meta as Record<string, unknown> | undefined;
            return meta?.description;
          }) ||
          '',
      ) || null,
      thumbnail:
        String(dict_get(image, ['source', 'dynamicSource']) || '') || undefined,
      timestamp: int_or_none(video.date) ?? undefined,
      duration: int_or_none(video.length) ?? undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: ABCOTVSIE.IE_NAME,
      extractor_key: 'ABCOTVS',
    };
  }
}

export class ABCOTVSClipsIE extends InfoExtractor {
  static IE_NAME = 'abcotvs:clips';
  static _VALID_URL = /https?:\/\/clips\.abcotvs\.com\/(?:[^/]+\/)*video\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._download_json<{ results: Record<string, unknown>[] }>(
      `https://clips.abcotvs.com/vogo/video/getByIds?ids=${videoId}`,
      videoId,
    );
    const videoData = resp.results[0]!;
    const title = String(videoData.title || videoId);
    const formats = await this._extract_m3u8_formats(
      String(videoData.videoURL).split('?')[0]!,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    return {
      id: videoId,
      title,
      description: String(videoData.description || '') || null,
      thumbnail: String(videoData.thumbnailURL || '') || undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      timestamp: int_or_none(videoData.pubDate) ?? undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: ABCOTVSClipsIE.IE_NAME,
      extractor_key: 'ABCOTVSClips',
    };
  }
}
