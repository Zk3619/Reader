/**
 * ClipRsIE — ported from yt-dlp cliprs.py
 * Upstream extends OnetBaseIE; the relevant Onet API call is inlined here
 * since OnetBaseIE is not part of this batch. Upstream marks this
 * extractor as broken (_WORKING = False).
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, float_or_none } from '../../utils';

export class ClipRsIE extends InfoExtractor {
  static IE_NAME = 'cliprs';
  static _VALID_URL = /https?:\/\/(?:www\.)?clip\.rs\/(?<id>[^/]+)\/\d+/;

  private _searchMvpId(webpage: string): string {
    return this._search_regex(/id=(["'])mvp:(?<id>.+?)\1/, webpage, 'mvp id', undefined, true, 'id')!;
  }

  private async _extractFromId(videoId: string, webpage?: string): Promise<VideoInfo> {
    const response = await this._download_json<{
      error?: { message: string };
      result?: Record<string, { formats: Record<string, unknown>; meta?: Record<string, unknown> }>;
    }>('http://qi.ckm.onetapi.pl/', videoId, undefined, {
      query: {
        'body[id]': videoId,
        'body[jsonrpc]': '2.0',
        'body[method]': 'get_asset_detail',
        'body[params][ID_Publikacji]': videoId,
        'body[params][Service]': 'www.onet.pl',
        'content-type': 'application/jsonp',
        'x-onet-app': 'player.front.onetapi.pl',
      },
    });

    if (response.error) {
      throw new ExtractorError(`${this.IE_NAME} said: ${response.error.message}`, { expected: true });
    }

    const video = response.result?.['0'];
    if (!video) throw new ExtractorError('Unable to extract video asset detail');

    const formats: Format[] = [];
    for (const [formatType, formatsDict] of Object.entries(video.formats || {})) {
      if (!formatsDict || typeof formatsDict !== 'object') continue;
      for (const [formatId, formatList] of Object.entries(formatsDict as Record<string, unknown>)) {
        if (!Array.isArray(formatList)) continue;
        for (const f of formatList as Array<Record<string, unknown>>) {
          const videoUrl = f.url as string | undefined;
          if (!videoUrl) continue;
          const ext = determine_ext(videoUrl);
          if (formatId.startsWith('hls') || ext === 'm3u8') {
            formats.push(
              ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
            );
          } else if (ext === 'mpd') {
            formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
          } else {
            const httpF: Format = {
              url: videoUrl,
              format_id: formatId,
              abr: float_or_none(f.audio_bitrate) ?? undefined,
            };
            if (formatType === 'audio') {
              httpF.vcodec = 'none';
            } else {
              httpF.height = f.vertical_resolution as number | undefined;
              httpF.width = f.horizontal_resolution as number | undefined;
              httpF.vbr = float_or_none(f.video_bitrate) ?? undefined;
            }
            formats.push(httpF);
          }
        }
      }
    }

    const meta = video.meta || {};
    const title = (webpage && this._og_search_title(webpage)) || (meta.title as string) || videoId;
    const description = (webpage && this._og_search_description(webpage)) || (meta.description as string) || undefined;
    const duration = (meta.length as number) || (meta.lenght as number) || undefined;
    const timestamp = parseIso8601FromSpace(meta.addDate);

    return { id: videoId, title, description, duration, timestamp, formats };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const mvpId = this._searchMvpId(webpage);
    const info = await this._extractFromId(mvpId, webpage);
    info.display_id = displayId;
    return info;
  }
}

function parseIso8601FromSpace(v: unknown): number | undefined {
  if (v == null) return undefined;
  const s = String(v).replace(' ', 'T');
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.trunc(t / 1000) : undefined;
}
