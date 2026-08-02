/** StreamCZIE — ported from yt-dlp streamcz.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_codecs, traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

export class StreamCZIE extends InfoExtractor {
  static IE_NAME = 'streamcz';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:stream|televizeseznam)\.cz\/[^?#]+\/(?<display_id>[^?#]+)-(?<id>[0-9]+)/;

  protected *_extractFormats(splUrl: string, video: Record<string, unknown>): Generator<Format> {
    const pairs: Array<[string, number, Record<string, unknown>]> = [
      ['ts', -1, (traverse_obj(video, ['http_stream', 'qualities']) as Record<string, unknown>) || {}],
      ['mp4', 1, (video.mp4 as Record<string, unknown>) || {}],
    ];
    for (const [ext, pref, streams] of pairs) {
      for (const [formatId, stream] of Object.entries(streams)) {
        const s = stream as Record<string, unknown>;
        if (!s.url) continue;
        const resolution = s.resolution as number[] | undefined;
        yield {
          format_id: `${formatId}-${ext}`,
          ext,
          source_preference: pref,
          url: urljoin(splUrl, String(s.url)),
          tbr: float_or_none(s.bandwidth, 1000) ?? undefined,
          duration: float_or_none(s.duration, 1000) ?? undefined,
          width: resolution?.[0],
          height: resolution?.[1] || int_or_none(formatId.replace('p', '')) || undefined,
          ...parse_codecs(s.codec as string | undefined),
        };
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const videoId = m.groups!.id!;
    const data = (
      await this._download_json<{ data?: { episode?: Record<string, unknown> } }>(
        'https://www.televizeseznam.cz/api/graphql',
        videoId,
        'Downloading GraphQL result',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          data: JSON.stringify({
            variables: { urlName: videoId },
            query: `query LoadEpisode($urlName : String){ episode(urlName: $urlName){ id spl urlName name perex duration views } }`,
          }),
        },
      )
    ).data?.episode!;
    let splUrl = String(data.spl) + 'spl2,3';
    let metadata = await this._download_json<Record<string, unknown>>(splUrl, videoId, 'Downloading playlist');
    if ('Location' in metadata && !('data' in metadata)) {
      splUrl = String(metadata.Location);
      metadata = await this._download_json(splUrl, videoId, 'Downloading redirected playlist');
    }
    const video = (metadata.data as Record<string, unknown>) || {};
    const subtitles: Record<string, Subtitle[]> = {};
    for (const subs of Object.values((video.subtitles as Record<string, Record<string, unknown>>) || {})) {
      if (!subs.language) continue;
      const lang = String(subs.language);
      for (const [ext, subUrl] of Object.entries((subs.urls as Record<string, string>) || {})) {
        (subtitles[lang] ||= []).push({ ext, url: urljoin(splUrl, subUrl) });
      }
    }
    const formats = [...this._extractFormats(splUrl, video)];
    return {
      id: videoId,
      display_id: displayId,
      title: (data.name as string) || undefined,
      description: (data.perex as string) || undefined,
      duration: float_or_none(data.duration) ?? undefined,
      view_count: int_or_none(data.views) ?? undefined,
      formats,
      subtitles,
    };
  }
}
