/**
 * CellebriteIE — ported from yt-dlp cellebrite.py
 * Upstream extends VidyardBaseIE; the Vidyard fetch/format logic is inlined
 * here since VidyardBaseIE is not part of this batch.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, float_or_none, int_or_none, str_or_none, url_or_none } from '../../utils';

const VIDYARD_HEADERS = { Referer: 'https://play.vidyard.com/' };

function urlBasename(u: string): string {
  try {
    return new URL(u).pathname.split('/').filter(Boolean).pop() || u;
  } catch {
    return u.split('/').filter(Boolean).pop() || u;
  }
}

export class CellebriteIE extends InfoExtractor {
  static IE_NAME = 'cellebrite';
  static _VALID_URL = /https?:\/\/cellebrite\.com\/(?:\w+)?\/(?<id>[\w-]+)/;

  private _findVidyardEmbedUrl(webpage: string): string | null {
    const iframe = webpage.match(/<iframe[^>]* src=["'](?:https?:)?\/\/play\.vidyard\.com\/([\w-]+)/i);
    if (iframe?.[1]) return `https://play.vidyard.com/${iframe[1]}`;

    for (const m of webpage.matchAll(/<(?:img|div)[^>]* class=(["'])(?:[^>"']* )?vidyard-player-embed(?: [^>"']*)?\1[^>]+>/gi)) {
      const uuid = extract_attributes(m[0]).uuid || extract_attributes(m[0])['data-uuid'];
      if (uuid) return `https://play.vidyard.com/${uuid}`;
    }

    const script = webpage.match(/<script[^>]* id=["']vidyard_embed_code_([\w-]+)["']/i);
    if (script?.[1]) return `https://play.vidyard.com/${script[1]}`;

    return null;
  }

  private async _extractVidyardFormats(videoId: string, sources: Record<string, unknown>): Promise<Format[]> {
    const formats: Format[] = [];
    const hlsList = Array.isArray((sources as Record<string, unknown>).hls)
      ? ((sources as Record<string, unknown>).hls as Array<Record<string, unknown>>)
      : [];
    const auto = hlsList.find((h) => h.profile === 'auto');
    const variants = auto ? [auto] : hlsList;
    for (const variant of variants) {
      const hlsUrl = url_or_none(variant.url);
      if (!hlsUrl) continue;
      formats.push(
        ...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false, {
          headers: VIDYARD_HEADERS,
        })),
      );
      if (formats.length) break;
    }
    for (const [sourceType, sourceList] of Object.entries(sources)) {
      if (sourceType === 'hls' || !Array.isArray(sourceList)) continue;
      for (const source of sourceList as Array<Record<string, unknown>>) {
        const srcUrl = url_or_none(source.url);
        if (!srcUrl) continue;
        formats.push({ url: srcUrl, format_id: `http-${sourceType}`, http_headers: VIDYARD_HEADERS });
      }
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const webpage = await this._download_webpage(url, slug);
    const vidyardUrl = this._findVidyardEmbedUrl(webpage);
    if (!vidyardUrl) throw new ExtractorError('No Vidyard video embeds found on page');

    const videoId = urlBasename(vidyardUrl);
    const playerJson = await this._download_json<{
      payload: { chapters: Array<Record<string, unknown>> };
    }>(`https://play.vidyard.com/player/${videoId}.json`, videoId);
    const chapter = playerJson.payload.chapters[0]!;

    const formats = await this._extractVidyardFormats(videoId, (chapter.sources as Record<string, unknown>) || {});

    const displayId = str_or_none(chapter.videoId) || undefined;

    return {
      id: str_or_none(chapter.facadeUuid) || videoId,
      display_id: displayId,
      title: str_or_none(chapter.name) || undefined,
      description: this._og_search_description(webpage) || undefined,
      duration: float_or_none(chapter.milliseconds, 1000) ?? int_or_none(chapter.seconds) ?? undefined,
      thumbnail: url_or_none(this._og_search_thumbnail(webpage)) || undefined,
      formats,
      http_headers: VIDYARD_HEADERS,
      _old_archive_ids: displayId ? [`cellebrite ${displayId}`] : undefined,
    };
  }
}
