/** SeznamZpravy family — ported from yt-dlp seznamzpravy.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_codecs, parse_qs } from '../../utils';
import { urljoin } from './_helpers';

function rawId(srcUrl: string): string {
  try {
    return new URL(srcUrl).pathname.split('/').pop() || srcUrl;
  } catch {
    return srcUrl.split('/').pop() || srcUrl;
  }
}

export class SeznamZpravyIE extends InfoExtractor {
  static IE_NAME = 'seznamzpravy';
  static _VALID_URL = /https?:\/\/(?:www\.)?seznamzpravy\.cz\/iframe\/player\?.*\bsrc=/;

  protected async _extractSdnFormats(sdnUrl: string, videoId: string): Promise<Format[]> {
    let sdnData = await this._download_json<Record<string, unknown>>(sdnUrl, videoId);
    if (sdnData.Location) {
      sdnUrl = String(sdnData.Location);
      sdnData = await this._download_json<Record<string, unknown>>(sdnUrl, videoId);
    }

    const formats: Format[] = [];
    const mp4Formats = ((sdnData.data as Record<string, unknown>)?.mp4 as Record<string, Record<string, unknown>>) || {};
    for (const [formatId, formatData] of Object.entries(mp4Formats)) {
      const relativeUrl = formatData.url as string | undefined;
      if (!relativeUrl) continue;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const res = formatData.resolution as [number, number];
        width = res[0];
        height = res[1];
      } catch {
        /* ignore */
      }
      formats.push({
        url: urljoin(sdnUrl, relativeUrl),
        format_id: `http-${formatId}`,
        tbr: int_or_none(formatData.bandwidth, 1000) ?? undefined,
        width: int_or_none(width) ?? undefined,
        height: int_or_none(height) ?? undefined,
        ...parse_codecs(formatData.codec as string | undefined),
      });
    }

    const pls = (sdnData.pls as Record<string, { url?: string }>) || {};
    if (pls.dash?.url) {
      formats.push(...(await this._extract_mpd_formats(urljoin(sdnUrl, pls.dash.url), videoId, 'dash', undefined, false)));
    }
    if (pls.hls?.url) {
      formats.push(
        ...(await this._extract_m3u8_formats(urljoin(sdnUrl, pls.hls.url), videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const params = parse_qs(url);
    const src = params.src?.[params.src.length - 1]!;
    const title = params.title?.[params.title.length - 1]!;
    const videoId = params.contentId?.[params.contentId.length - 1] || rawId(src);
    const formats = await this._extractSdnFormats(`${src}spl2,2,VOD`, videoId);

    return {
      id: videoId,
      title,
      thumbnail: params.poster?.[params.poster.length - 1],
      duration: int_or_none(params.duration?.[params.duration.length - 1]) ?? undefined,
      series: params.series?.[params.series.length - 1],
      formats,
    };
  }
}

export class SeznamZpravyArticleIE extends InfoExtractor {
  static IE_NAME = 'seznamzpravy:article';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:seznam\.cz\/zpravy|seznamzpravy\.cz)\/clanek\/(?:[^/?#&]+)-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const ld = this._search_json_ld(webpage, articleId) || {};
    const title = (ld.title as string | undefined) || this._og_search_title(webpage, false) || articleId;
    const description = (ld.description as string | undefined) || this._og_search_description(webpage) || undefined;

    const embedUrls: string[] = [];
    for (const m of webpage.matchAll(/https?:\/\/(?:www\.)?seznamzpravy\.cz\/iframe\/player\?[^"'<>]+/g)) {
      embedUrls.push(m[0]!);
    }

    const entries = embedUrls.map((entryUrl) => this.url_result(entryUrl, 'seznamzpravy'));
    return this.playlist_result(entries, articleId, title, description);
  }
}
