// @ts-nocheck
/** VidflexIE â€?ported from yt-dlp vidflex.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  join_nonempty,
  merge_dicts,
  mimetype2ext,
  traverse_obj,
  url_or_none,
} from '../../utils';

const DOMAINS_RE = [
  String.raw`[^.]+\.vidflex\.tv`,
  String.raw`(?:www\.)?acactv\.ca`,
  String.raw`(?:www\.)?albertalacrossetv\.com`,
  String.raw`(?:www\.)?cjfltv\.com`,
  String.raw`(?:www\.)?figureitoutbaseball\.com`,
  String.raw`(?:www\.)?ocaalive\.com`,
  String.raw`(?:www\.)?pegasussports\.tv`,
  String.raw`(?:www\.)?praxisseries\.ca`,
  String.raw`(?:www\.)?silenticetv\.com`,
  String.raw`(?:www\.)?tuffhedemantv\.com`,
  String.raw`(?:www\.)?watchfuntv\.com`,
  String.raw`live\.ofsaa\.on\.ca`,
  String.raw`tv\.procoro\.ca`,
  String.raw`tv\.realcastmedia\.net`,
  String.raw`tv\.fringetheatre\.ca`,
  String.raw`video\.haisla\.ca`,
  String.raw`video\.hockeycanada\.ca`,
  String.raw`video\.huuayaht\.org`,
  String.raw`video\.turningpointensemble\.ca`,
  String.raw`videos\.livingworks\.net`,
  String.raw`videos\.telusworldofscienceedmonton\.ca`,
  String.raw`watch\.binghamtonbulldogs\.com`,
  String.raw`watch\.rekindle\.tv`,
  String.raw`watch\.wpca\.com`,
].join('|');

export class VidflexIE extends InfoExtractor {
  static IE_NAME = 'vidflex';
  static _VALID_URL = new RegExp(
    `https?://(?:${DOMAINS_RE})/[a-z]{2}(?:-[a-z]{2})?/c/[\\w-]+\\.(?<id>\\d+)`,
  );

  protected async *_yieldFormats(
    mediaConfig: Record<string, unknown> | null | undefined,
    videoId: string,
  ): AsyncGenerator<Format> {
    const sources = traverse_obj(mediaConfig, ['media', 'source']) as unknown;
    if (!Array.isArray(sources)) return;
    for (const mediaSource of sources) {
      if (!mediaSource || typeof mediaSource !== 'object') continue;
      const src = mediaSource as Record<string, unknown>;
      const mediaUrl = url_or_none(src.src);
      if (!mediaUrl) continue;
      const mediaType = mimetype2ext(src.type != null ? String(src.type) : undefined);

      if (mediaType === 'm3u8') {
        yield* await this._extract_m3u8_formats(
          mediaUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
      } else if (mediaType === 'mp4') {
        const bitrate = this._search_regex(/_(\d+)k\.mp4/, mediaUrl, 'bitrate', null, false);
        yield {
          format_id: join_nonempty('http', bitrate),
          url: mediaUrl,
          ext: 'mp4',
          tbr: int_or_none(bitrate) ?? undefined,
        };
      } else {
        yield {
          url: mediaUrl,
          ext: mediaType || undefined,
        };
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const dataUrl = this._html_search_regex(
      /content_api:\s*(["'])(?<url>https?:\/\/(?:(?!\1).)+)\1/,
      webpage,
      'content api url',
      null,
      true,
      'url',
    )!;

    const raw = await this._download_json<Record<string, unknown>>(dataUrl, videoId);
    let mediaConfig: Record<string, unknown> | null = null;
    try {
      const b64 = traverse_obj(raw, ['config']) as string | undefined;
      if (b64) {
        mediaConfig = JSON.parse(atob(b64)) as Record<string, unknown>;
      }
    } catch {
      mediaConfig = null;
    }

    const formats: Format[] = [];
    for await (const f of this._yieldFormats(mediaConfig, videoId)) {
      formats.push(f);
    }

    const cleaned = webpage.replace(/\/\*<!\[CDATA\[\*\//g, '').replace(/\/\*\]\]>\*\//g, '');
    const jsonLd = (this._search_json_ld(cleaned, videoId, { fatal: false }) || {}) as Record<
      string,
      unknown
    >;

    return merge_dicts(jsonLd, {
      id: videoId,
      formats,
      title: (jsonLd.title as string) || videoId,
    }) as VideoInfo;
  }
}
