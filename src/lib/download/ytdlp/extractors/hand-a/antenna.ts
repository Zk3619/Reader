/**
 * AntennaGrWatchIE / Ant1NewsGrArticleIE / Ant1NewsGrEmbedIE — aligned with yt-dlp antenna.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, str_or_none, url_or_none } from '../../utils';

const BASE_PLAYER_URL_RE =
  /(?:https?:)?\/\/(?:[a-zA-Z0-9-]+\.)?(?:antenna|ant1news)\.gr\/templates\/pages\/player/i;

abstract class AntennaBaseIE extends InfoExtractor {
  protected _API_PATH = '';

  protected async downloadAndExtractApiData(
    videoId: string,
    netloc: string,
    cid?: string,
  ): Promise<Pick<VideoInfo, 'id' | 'title' | 'formats' | 'subtitles' | 'thumbnails'>> {
    const info = await this._download_json<Record<string, unknown>>(
      `https://${netloc}${this._API_PATH}`,
      videoId,
      undefined,
      { query: { cid: cid || videoId } },
    );
    if (!info.url) throw new ExtractorError(`No source found for ${videoId}`, { expected: true });

    const streamUrl = String(info.url);
    const ext = determine_ext(streamUrl);
    let formats: Format[] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    if (ext === 'm3u8') {
      formats = await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
    } else {
      formats = [{ url: streamUrl, format_id: ext, ext }];
    }

    const thumbnails: Thumbnail[] = [];
    const thumb = url_or_none(info.thumb);
    if (thumb) thumbnails.push({ url: thumb });

    return {
      id: videoId,
      title: str_or_none(info.title) || videoId,
      formats,
      subtitles,
      thumbnails,
    };
  }
}

export class AntennaGrWatchIE extends AntennaBaseIE {
  static IE_NAME = 'antenna:watch';
  static IE_DESC = 'antenna.gr and ant1news.gr videos';
  static _VALID_URL =
    /https?:\/\/(?<netloc>(?:www\.)?(?:antenna|ant1news)\.gr)\/watch\/(?<id>\d+)\//i;

  protected _API_PATH = '/templates/data/player';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? m[2] ?? '';
    const netloc = m.groups?.netloc ?? m[1] ?? '';
    const webpage = await this._download_webpage(url, videoId);
    const info = await this.downloadAndExtractApiData(videoId, netloc);
    return {
      ...info,
      description: this._og_search_description(webpage),
      webpage_url: url,
      original_url: url,
      extractor: 'antenna:watch',
      extractor_key: 'AntennaGrWatch',
    };
  }
}

export class Ant1NewsGrArticleIE extends AntennaBaseIE {
  static IE_NAME = 'ant1newsgr:article';
  static IE_DESC = 'ant1news.gr articles';
  static _VALID_URL = /https?:\/\/(?:www\.)?ant1news\.gr\/[^/]+\/article\/(?<id>\d+)\//i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const info = this._search_json_ld(webpage, videoId, { fatal: false, expected_type: 'NewsArticle' });

    const embedUrls: string[] = [];
    const iframeRe = new RegExp(
      `<iframe[^>]+?src=(["'])(?P<url>${BASE_PLAYER_URL_RE.source}\\?(?:(?!\\1).)+)\\1`,
      'gi',
    );
    for (const m of webpage.matchAll(iframeRe)) {
      const u = m.groups?.url ?? m[1];
      if (u) embedUrls.push(u);
    }
    if (!embedUrls.length) {
      throw new ExtractorError(`no videos found for ${videoId}`, { expected: true });
    }

    const entries = embedUrls.map((u) =>
      this.url_result(u, 'Ant1NewsGrEmbed', videoId, String(info.headline || info.name || videoId)),
    );
    return this.playlist_result(
      entries,
      videoId,
      str_or_none(info.headline || info.name) || videoId,
    );
  }
}

export class Ant1NewsGrEmbedIE extends AntennaBaseIE {
  static IE_NAME = 'ant1newsgr:embed';
  static IE_DESC = 'ant1news.gr embedded videos';
  static _VALID_URL = new RegExp(
    `${BASE_PLAYER_URL_RE.source}\\?([^#]+&)?cid=(?<id>[^#&]+)`,
    'i',
  );

  protected _API_PATH = '/templates/data/jsonPlayer';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const parsed = new URL(url);
    const cid = parsed.searchParams.get('cid');
    if (!cid) throw new ExtractorError('Could not resolve cid from player URL', { expected: true });

    const info = await this.downloadAndExtractApiData(videoId, parsed.host, cid);
    return { ...info, webpage_url: url, original_url: url, extractor: 'ant1newsgr:embed', extractor_key: 'Ant1NewsGrEmbed' };
  }
}
