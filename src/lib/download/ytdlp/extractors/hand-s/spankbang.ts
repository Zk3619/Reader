/** SpankBangIE / SpankBangPlaylistIE — ported from yt-dlp spankbang.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  merge_dicts,
  parse_duration,
  str_to_int,
  url_or_none,
} from '../../utils';
import { parse_resolution, urlencodePostdata, urljoin } from './_helpers';

export class SpankBangIE extends InfoExtractor {
  static IE_NAME = 'spankbang';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?spankbang\.com\/(?:[\da-z]+\/(?:video|play|embed)\b|[\da-z]+-(?<id_2>[\da-z]+)\/playlist\/[^/?#&]+|(?<id>[\da-z]+)\/(?:video|play|embed)\b)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id || m.groups!.id_2!;
    const country = this.params.geo_bypass_country || 'US';
    void country;
    const pageUrl = url.replace(`/${videoId}/embed`, `/${videoId}/video`);
    const webpage = await this._download_webpage(pageUrl, videoId);
    if (/<[^>]+\b(?:id|class)=["']video_removed/.test(webpage)) {
      throw new ExtractorError(`Video ${videoId} is not available`, { expected: true });
    }
    const formats: Format[] = [];
    const extractFormat = async (formatId: string, formatUrl: unknown) => {
      const fUrl = url_or_none(formatUrl);
      if (!fUrl) return;
      const f = parse_resolution(formatId);
      const ext = determine_ext(fUrl);
      if (formatId.startsWith('m3u8') || ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(fUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (formatId.startsWith('mpd') || ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(fUrl, videoId, undefined, undefined, false)));
      } else if (ext === 'mp4' || f.width || f.height) {
        formats.push({ ...f, url: fUrl, format_id: formatId });
      }
    };
    for (const mobj of webpage.matchAll(/stream_url_(?<id>[^\s=]+)\s*=\s*(["'])(?<url>(?:(?!\2).)+)\2/g)) {
      await extractFormat(mobj.groups!.id!, mobj.groups!.url);
    }
    if (!formats.length) {
      const streamKey = this._search_regex(
        /data-streamkey\s*=\s*(["'])(?<value>(?:(?!\1).)+)\1/,
        webpage,
        'stream key',
        null,
        false,
        'value',
      )!;
      const stream = await this._download_json<Record<string, unknown>>(
        'https://spankbang.com/api/videos/stream',
        videoId,
        'Downloading stream JSON',
        {
          method: 'POST',
          data: urlencodePostdata({ id: streamKey, data: '0' }),
          headers: { Referer: url, 'X-Requested-With': 'XMLHttpRequest' },
        },
      );
      for (const [formatId, formatUrl] of Object.entries(stream)) {
        const u = Array.isArray(formatUrl) ? formatUrl[0] : formatUrl;
        await extractFormat(formatId, u);
      }
    }
    const info = this._search_json_ld(webpage, videoId, { fatal: false }) || {};
    return merge_dicts(
      {
        id: videoId,
        title:
          this._html_search_regex(/<h1[^>]+\btitle=["']([^"]+)["']>/, webpage, 'title', null, false) || videoId,
        description:
          this._search_regex(
            /<div[^>]+\bclass=["']bottom[^>]+>\s*<p>[^<]*<\/p>\s*<p>([^<]+)/,
            webpage,
            'description',
            null,
            false,
          ) || undefined,
        thumbnail: this._og_search_thumbnail(webpage) || undefined,
        uploader:
          this._html_search_regex(
            /<svg[^>]+\bclass="(?:[^"]*?user[^"]*?)">[\s\S]*?<\/svg>([^<]+)/,
            webpage,
            'uploader',
            null,
            false,
          ) || undefined,
        uploader_id:
          this._html_search_regex(/<a[^>]+href="\/profile\/([^"]+)"/, webpage, 'uploader_id', null, false) ||
          undefined,
        duration:
          parse_duration(
            this._search_regex(
              /<div[^>]+\bclass=["']right_side[^>]+>\s*<span>([^<]+)/,
              webpage,
              'duration',
              null,
              false,
            ),
          ) ?? undefined,
        view_count:
          str_to_int(this._search_regex(/([\d,.]+)\s+plays/, webpage, 'view count', null, false)) ?? undefined,
        formats,
        age_limit: 18,
      },
      info,
    ) as VideoInfo;
  }
}

export class SpankBangPlaylistIE extends InfoExtractor {
  static IE_NAME = 'spankbang:playlist';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?spankbang\.com\/(?<id>[\da-z]+)\/playlist\/(?<display_id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const country = this.params.geo_bypass_country || 'US';
    void country;
    const webpage = await this._download_webpage(url, playlistId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(
      /<a[^>]+\bhref=(["'])(?<path>\/?[\da-z]+-(?<vid>[\da-z]+)\/playlist\/[^"']*)\1/g,
    )) {
      entries.push(this.url_result(urljoin(url, m.groups!.path!), 'SpankBang', m.groups!.vid));
    }
    const titleMatch = webpage.match(/data-testid=["']playlist-title["'][^>]*>([^<]+)/i);
    const title = titleMatch ? clean_html(titleMatch[1]!.replace(/ Playlist$/i, '')) : undefined;
    return this.playlist_result(entries, playlistId, title);
  }
}
