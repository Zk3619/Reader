/**
 * BunnyCdnIE — ported from yt-dlp bunnycdn.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { extract_attributes, parse_qs, unsmuggle_url, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, mergeSubtitles } from './_helpers';

export class BunnyCdnIE extends InfoExtractor {
  static IE_NAME = 'bunnycdn';
  static _VALID_URL =
    /https?:\/\/(?:(?:iframe|player)\.mediadelivery\.net|video\.bunnycdn\.com)\/(?:embed|play)\/(?<library_id>\d+)\/(?<id>[\da-f-]+)/;

  async _real_extract(rawUrl: string): Promise<VideoInfo> {
    const [url, smuggledData] = unsmuggle_url(rawUrl, {});
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const libraryId = m.groups!.library_id!;

    const qs = parse_qs(url);
    const webpage = await this._download_webpage(
      `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`,
      videoId,
      undefined,
      {
        headers: { Referer: (smuggledData.Referer as string) || 'https://iframe.mediadelivery.net/' },
        query: {
          ...(qs.token?.[0] ? { token: qs.token[0]! } : {}),
          ...(qs.expires?.[0] ? { expires: qs.expires[0]! } : {}),
        },
      },
    );

    const htmlTitle = htmlExtractTitle(webpage);
    if (htmlTitle === '403') {
      throw new ExtractorError(
        'This video is inaccessible. Setting a Referer header might be required to access the video',
        { expected: true },
      );
    } else if (htmlTitle === '404') {
      throw new ExtractorError('This video does not exist', { expected: true });
    }

    const headers = { Referer: url };
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const srcMatch of webpage.matchAll(/<source[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
      const srcUrl = url_or_none(srcMatch[1]);
      if (srcUrl) formats.push({ format_id: 'html5', url: srcUrl, http_headers: headers });
    }

    const originalUrl = this._search_regex(
      /(?:var|const|let)\s+originalUrl\s*=\s*["']([^"']+)["']/,
      webpage,
      'original url',
      null,
      false,
    );
    if (url_or_none(originalUrl)) {
      const resp = await this._request_webpage(
        { url: originalUrl!, headers },
        videoId,
        'Checking original',
        { fatal: false },
      );
      if (resp) {
        formats.push({ url: originalUrl!, format_id: 'source', quality: 1, http_headers: headers, ext: 'mp4' });
      }
    }

    const srcUrl = this._search_regex(/\.setAttribute\(['"]src['"],\s*['"]([^'"]+)['"]\)/, webpage, 'src url', null, false);
    const activationUrl = this._search_regex(/loadUrl\(['"]([^'"]+\/activate)['"]/, webpage, 'activation url', null, false);
    const pingUrl = this._search_regex(/loadUrl\(['"]([^'"]+\/ping)['"]/, webpage, 'ping url', null, false);
    const secret = srcUrl ? parse_qs(srcUrl).secret?.[0] : undefined;
    const contextId = srcUrl ? parse_qs(srcUrl).contextId?.[0] : undefined;

    let pingData: Record<string, unknown> = {};
    if (srcUrl && activationUrl && pingUrl && secret && contextId) {
      await this._download_webpage(activationUrl, videoId, 'Downloading activation data', { headers });
      const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, videoId);
      for (const fmt of res.formats) {
        fmt.protocol = 'bunnycdn';
        fmt.http_headers = headers;
      }
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);

      pingData = {
        _bunnycdn_ping_data: { url: pingUrl, headers, secret, context_id: contextId },
      };
    }

    let title: string | undefined;
    let thumbnail: string | undefined;
    const mainVideoTag = this._search_regex(/<[^>]+id=["']main-video["'][^>]*>/, webpage, 'main video tag', null, false);
    if (mainVideoTag) {
      const attrs = extract_attributes(mainVideoTag);
      thumbnail = url_or_none(attrs['data-poster']) || undefined;
      const plyrConfig = attrs['data-plyr-config'];
      if (plyrConfig) {
        try {
          title = (JSON.parse(plyrConfig) as { title?: string }).title;
        } catch {
          /* ignore */
        }
      }
    }

    return {
      id: videoId,
      title,
      thumbnail,
      formats,
      subtitles,
      ...pingData,
    };
  }
}
