/**
 * IviIE / IviCompilationIE — ported from yt-dlp ivi.py
 *
 * Blowfish CMAC signing (site 353) is omitted — only unsigned site 183 path is used.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

const KNOWN_FORMATS = [
  'MP4-low-mobile',
  'MP4-mobile',
  'FLV-lo',
  'MP4-lo',
  'FLV-hi',
  'MP4-hi',
  'MP4-SHQ',
  'MP4-HD720',
  'MP4-HD1080',
];

function formatQuality(formatId: string): number {
  const idx = KNOWN_FORMATS.indexOf(formatId);
  return idx >= 0 ? idx : -1;
}

export class IviIE extends InfoExtractor {
  static IE_NAME = 'ivi';
  static IE_DESC = 'ivi.ru';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ivi\.(?:ru|tv)\/(?:watch\/(?:[^/]+\/)?|video\/player\?.*?videoId=)(?<id>\d+)/;

  protected _LIGHT_URL = 'https://api.ivi.ru/light/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const contentData = JSON.stringify({
      method: 'da.content.get',
      params: [
        videoId,
        {
          site: 's183',
          referrer: `http://www.ivi.ru/watch/${videoId}`,
          contentid: videoId,
        },
      ],
    });

    const videoJson = await this._download_json<{
      error?: { origin?: string; message?: string; user_message?: string };
      result?: Record<string, unknown>;
    }>(this._LIGHT_URL, videoId, 'Downloading video JSON', {
      data: contentData,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const error = videoJson.error;
    if (error) {
      const origin = error.origin;
      const message = error.message || error.user_message;
      if (origin === 'NotAllowedForLocation') {
        this.raise_geo_restricted(message || undefined, ['RU']);
      }
      if (origin === 'NoRedisValidData') {
        throw new ExtractorError(`Video ${videoId} does not exist`, { expected: true });
      }
      throw new ExtractorError(`Unable to download video ${videoId}${message ? `: ${message}` : ''}`, {
        expected: true,
      });
    }

    const result = videoJson.result!;
    let title = String(result.title ?? videoId);
    const compilation = result.compilation != null ? String(result.compilation) : undefined;
    const episode = compilation ? title : undefined;
    if (compilation) title = `${compilation} - ${title}`;

    const formats: Format[] = [];
    for (const f of (result.files as Array<Record<string, unknown>>) || []) {
      const fUrl = f.url != null ? String(f.url) : '';
      const contentFormat = f.content_format != null ? String(f.content_format) : '';
      if (!fUrl) continue;
      if (contentFormat.includes('-MDRM-') || contentFormat.includes('-FPS-')) continue;
      formats.push({
        url: fUrl,
        format_id: contentFormat,
        quality: formatQuality(contentFormat),
        filesize: int_or_none(f.size_in_bytes) ?? undefined,
      });
    }

    const thumbnails: Thumbnail[] = ((result.preview as Array<Record<string, unknown>>) || [])
      .filter((preview) => preview.url)
      .map((preview) => ({
        url: String(preview.url),
        id: preview.content_format != null ? String(preview.content_format) : undefined,
      }));

    const webpage = await this._download_webpage(url, videoId);
    const season =
      this._search_regex(/<li[^>]+class="season active"[^>]*><a[^>]+>([^<]+)/, webpage, 'season', null, false) ||
      undefined;
    const seasonNumber = int_or_none(
      this._search_regex(
        /<li[^>]+class="season active"[^>]*><a[^>]+data-season(?:-index)?="(\d+)"/,
        webpage,
        'season number',
        null,
        false,
      ),
    );
    const episodeNumber = int_or_none(
      this._search_regex(
        /[^>]+itemprop="episode"[^>]*>\s*<meta[^>]+itemprop="episodeNumber"[^>]+content="(\d+)"/,
        webpage,
        'episode number',
        null,
        false,
      ),
    );
    const description =
      this._og_search_description(webpage) ||
      this._html_search_meta('description', webpage, 'description', false) ||
      undefined;

    return {
      id: videoId,
      title,
      series: compilation,
      season,
      season_number: seasonNumber ?? undefined,
      episode,
      episode_number: episodeNumber ?? undefined,
      thumbnails,
      description,
      duration: int_or_none(result.duration) ?? undefined,
      formats,
    };
  }
}

export class IviCompilationIE extends InfoExtractor {
  static IE_NAME = 'ivi:compilation';
  static IE_DESC = 'ivi.ru compilations';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ivi\.ru\/watch\/(?!\d+)(?<compilationid>[a-z\d_-]+)(?:\/season(?<seasonid>\d+))?$/;

  protected _extractEntries(html: string, compilationId: string): VideoInfo[] {
    const re = new RegExp(`<a\\b[^>]+\\bhref=["']/watch/${compilationId}/(\\d+)["']`, 'gi');
    return [...html.matchAll(re)].map((m) =>
      this.url_result(`http://www.ivi.ru/watch/${compilationId}/${m[1]}`, 'Ivi', m[1]!),
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const compilationId = m.groups!.compilationid!;
    const seasonId = m.groups!.seasonid || null;

    let entries: VideoInfo[];
    let playlistId: string;
    let playlistTitle: string | null;

    if (seasonId != null) {
      const seasonPage = await this._download_webpage(url, compilationId, `Downloading season ${seasonId} web page`);
      playlistId = `${compilationId}/season${seasonId}`;
      playlistTitle = this._html_search_meta('title', seasonPage, 'title', false);
      entries = this._extractEntries(seasonPage, compilationId);
    } else {
      const compilationPage = await this._download_webpage(url, compilationId, 'Downloading compilation web page');
      playlistId = compilationId;
      playlistTitle = this._html_search_meta('title', compilationPage, 'title', false);
      const seasons = [
        ...compilationPage.matchAll(new RegExp(`<a href="/watch/${compilationId}/season(\\d+)`, 'gi')),
      ].map((sm) => sm[1]!);

      if (!seasons.length) {
        entries = this._extractEntries(compilationPage, compilationId);
      } else {
        entries = [];
        for (const sid of seasons) {
          const seasonPage = await this._download_webpage(
            `http://www.ivi.ru/watch/${compilationId}/season${sid}`,
            compilationId,
            `Downloading season ${sid} web page`,
          );
          entries.push(...this._extractEntries(seasonPage, compilationId));
        }
      }
    }

    return this.playlist_result(entries, playlistId, playlistTitle || playlistId);
  }
}
