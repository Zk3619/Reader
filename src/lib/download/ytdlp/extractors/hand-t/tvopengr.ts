/**
 * TVOpenGrBaseIE / TVOpenGrWatchIE / TVOpenGrEmbedIE — ported from yt-dlp tvopengr.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class TVOpenGrBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TVOpenGrBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _returnCanonicalUrl(url: string, videoId: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, videoId);
    const canonical =
      this._og_search_property('url', webpage, 'og:url', false) ||
      this._html_search_meta('og:url', webpage) ||
      url;
    const title = this._og_search_title(webpage, false);
    return this.url_result(canonical, 'TVOpenGrWatch', videoId, title || undefined);
  }
}

export class TVOpenGrWatchIE extends TVOpenGrBaseIE {
  static IE_NAME = 'tvopengr:watch';
  static IE_DESC = 'tvopen.gr (and ethnos.gr) videos';
  static _VALID_URL =
    /https?:\/\/(?<netloc>(?:www\.)?(?:tvopen|ethnos)\.gr)\/watch\/(?<id>\d+)\/(?<slug>[^/]+)/;

  protected async _extractFormatsAndSubs(
    response: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const formatId of ['stream', 'httpstream', 'mpegdash']) {
      const formatUrl = response[formatId];
      if (typeof formatUrl !== 'string') continue;
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, formatId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        const res = await extractMpdFormatsAndSubtitles(this, formatUrl, videoId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else {
        formats.push({ url: formatUrl, format_id: formatId });
      }
    }
    return { formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const netloc = m.groups!.netloc!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.slug!;
    if (!netloc.includes('tvopen.gr')) {
      return this._returnCanonicalUrl(url, videoId);
    }

    const webpage = await this._download_webpage(url, videoId);
    const info = (await this._search_json_ld(webpage, videoId, { expected_type: 'VideoObject' })) as VideoInfo;
    const api = await this._download_json<Record<string, unknown>>(
      'https://www.tvopen.gr/templates/data/player',
      videoId,
      undefined,
      { query: { cid: videoId } },
    );
    const extracted = await this._extractFormatsAndSubs(api, videoId);
    return {
      ...info,
      formats: extracted.formats,
      subtitles: extracted.subtitles,
      id: videoId,
      display_id: displayId,
    };
  }
}

export class TVOpenGrEmbedIE extends TVOpenGrBaseIE {
  static IE_NAME = 'tvopengr:embed';
  static IE_DESC = 'tvopen.gr embedded videos';
  static _VALID_URL = /(?:https?:)?\/\/(?:www\.|cdn\.|)(?:tvopen|ethnos)\.gr\/embed\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this._returnCanonicalUrl(url, videoId);
  }
}
