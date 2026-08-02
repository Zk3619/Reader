/** MediaStreamBaseIE / MediaStreamIE / WinSportsVideoIE — ported from yt-dlp mediastream.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { filter_dict, parse_qs, remove_end, str_or_none, update_url_query, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class MediaStreamBaseIE extends InfoExtractor {
  static IE_NAME = 'mediastreambase';
  static _EMBED_BASE_URL = 'https://mdstrm.com/embed';
  static _BASE_URL_RE = /https?:\/\/mdstrm\.com\/(?:embed|live-stream)/;
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MediaStreamBaseIE is not a standalone extractor', { expected: true });
  }

  protected *_extractMediastreamUrls(webpage: string): Generator<string> {
    for (const m of webpage.matchAll(/<script[^>]+>[^>]*playerMdStream\.mdstreamVideo\(\s*['"](?<video_id>\w+)/g)) {
      yield `${MediaStreamBaseIE._EMBED_BASE_URL}/${m.groups!.video_id}`;
    }
    for (const m of webpage.matchAll(/<iframe[^>]+\bsrc="(https?:\/\/mdstrm\.com\/(?:embed|live-stream)\/\w+)/g)) {
      yield m[1]!;
    }
    for (const m of webpage.matchAll(
      /<(?:div|ps-mediastream)[^>]+class="[^"]*MediaStreamVideoPlayer[^"]*"[^>]+data-video-id="(?<video_id>\w+)"(?:\s*data-video-type="(?<video_type>[^"]+)")?/g,
    )) {
      const videoType = m.groups!.video_type === 'live' ? 'live-stream' : 'embed';
      yield `https://mdstrm.com/${videoType}/${m.groups!.video_id}`;
    }
  }
}

export class MediaStreamIE extends MediaStreamBaseIE {
  static IE_NAME = 'mediastream';
  static _VALID_URL = /https?:\/\/mdstrm\.com\/(?:embed|live-stream)\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    for (const message of [
      'Debido a tu ubicación no puedes ver el contenido',
      'You are not allowed to watch this video: Geo Fencing Restriction',
      'Este contenido no está disponible en tu zona geográfica.',
      'El contenido sólo está disponible dentro de',
    ]) {
      if (webpage.includes(message)) this.raise_geo_restricted();
    }

    const playerConfig =
      this._search_json<Record<string, unknown>>(/window\.MDSTRM\.OPTIONS\s*=/, webpage, 'metadata', videoId, {
        fatal: false,
      }) || {};
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const src = (playerConfig.src as Record<string, string>) || {};

    for (const [videoFormat, formatUrl] of Object.entries(src)) {
      if (videoFormat === 'hls') {
        const params = filter_dict({
          at: 'web-app',
          access_token: parse_qs(url).access_token?.[0] ?? undefined,
          uid: this._search_regex(/window\.MDSTRMUID\s*=\s*["']([^"']+)["'];/, webpage, 'uid', null, false) ?? undefined,
          sid: this._search_regex(/window\.MDSTRMSID\s*=\s*["']([^"']+)["'];/, webpage, 'sid', null, false) ?? undefined,
          pid: this._search_regex(/window\.MDSTRMPID\s*=\s*["']([^"']+)["'];/, webpage, 'pid', null, false) ?? undefined,
          av: this._search_regex(/window\.VERSION\s*=\s*["']([^"']+)["'];/, webpage, 'av', null, false) ?? undefined,
        }) as Record<string, string | number | (string | number)[] | null | undefined>;
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
          this,
          update_url_query(formatUrl, params),
          videoId,
          'hls',
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (videoFormat === 'mpd') {
        const mpd = await extractMpdFormatsAndSubtitles(this, formatUrl, videoId, 'dash');
        formats.push(...mpd.formats);
        mergeSubtitles(subtitles, mpd.subtitles);
      } else {
        formats.push({ url: formatUrl, format_id: videoFormat });
      }
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) || str_or_none(playerConfig.title) || undefined,
      description: this._og_search_description(webpage) ?? undefined,
      formats,
      subtitles,
      is_live: playerConfig.type === 'live',
      live_status: playerConfig.type === 'live' ? 'is_live' : 'not_live',
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
    };
  }
}

export class WinSportsVideoIE extends MediaStreamBaseIE {
  static IE_NAME = 'winsports';
  static _VALID_URL = /https?:\/\/www\.winsports\.co\/videos\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const data =
      this._search_json<Record<string, unknown>>(
        /<script\s*[^>]+data-drupal-selector="drupal-settings-json">/,
        webpage,
        'data',
        displayId,
        { fatal: false },
      ) || {};

    const formatters = (((data.settings as Record<string, unknown>)?.mediastream_formatter as unknown[]) || []) as Array<
      Record<string, unknown>
    >;
    let mediastreamUrl =
      url_or_none(formatters.map((x) => x.mediastream_id || x.url).find(Boolean)) ||
      [...this._extractMediastreamUrls(webpage)][0] ||
      null;
    if (!mediastreamUrl) this.raise_no_formats('No MediaStream embed found in webpage');

    const ld = this._search_json_ld(webpage, displayId, { fatal: false }) || {};
    const rawTitle = String((ld as Record<string, unknown>).title || this._og_search_title(webpage) || displayId);
    const title = remove_end(rawTitle, '| Win Sports')?.trim() || undefined;

    return {
      ...this.url_result(String(mediastreamUrl), 'MediaStream', displayId, title),
      _type: 'url_transparent',
      display_id: displayId,
    };
  }
}
