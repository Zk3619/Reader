/** Onet family — ported from yt-dlp onet.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  get_element_by_class,
  int_or_none,
  js_to_json,
  remove_start,
  str_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

const URL_BASE_RE = String.raw`https?:\/\/(?:(?:www\.)?onet\.tv|onet100\.vod\.pl)\/[a-z]\/`;

export class OnetBaseIE extends InfoExtractor {
  static IE_NAME = 'onetbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('OnetBaseIE is not a standalone extractor', { expected: true });
  }

  protected _searchMvpId(webpage: string): string {
    return this._search_regex(/id=(["'])mvp:(?<id>[\s\S]+?)\1/, webpage, 'mvp id', null, true, 'id')!;
  }

  protected async _extractFromId(videoId: string, webpage?: string): Promise<VideoInfo> {
    const response = await this._download_json<Record<string, unknown>>(
      'http://qi.ckm.onetapi.pl/',
      videoId,
      undefined,
      {
        query: {
          'body[id]': videoId,
          'body[jsonrpc]': '2.0',
          'body[method]': 'get_asset_detail',
          'body[params][ID_Publikacji]': videoId,
          'body[params][Service]': 'www.onet.pl',
          'content-type': 'application/jsonp',
          'x-onet-app': 'player.front.onetapi.pl',
        },
      },
    );

    const error = response.error as Record<string, unknown> | undefined;
    if (error) {
      throw new ExtractorError(`${OnetBaseIE.IE_NAME} said: ${error.message}`, { expected: true });
    }

    const video = (response.result as Record<string, Record<string, unknown>>)?.['0'];
    if (!video) throw new ExtractorError('Video not found', { expected: true });

    const formats: Format[] = [];
    for (const [formatType, formatsDict] of Object.entries((video.formats as Record<string, unknown>) || {})) {
      if (!formatsDict || typeof formatsDict !== 'object') continue;
      for (const [formatId, formatList] of Object.entries(formatsDict as Record<string, unknown>)) {
        if (!Array.isArray(formatList)) continue;
        for (const f of formatList as Array<Record<string, unknown>>) {
          const videoUrl = f.url as string | undefined;
          if (!videoUrl) continue;
          const ext = determine_ext(videoUrl);
          if (formatId.startsWith('ism')) {
            /* ISM formats skipped in TS port */
          } else if (ext === 'mpd') {
            formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
          } else if (formatId.startsWith('hls')) {
            formats.push(
              ...(await this._extract_m3u8_formats(
                videoUrl,
                videoId,
                'mp4',
                'm3u8_native',
                undefined,
                undefined,
                'hls',
                undefined,
                false,
              )),
            );
          } else {
            const httpF: Format = {
              url: videoUrl,
              format_id: formatId,
              abr: float_or_none(f.audio_bitrate) ?? undefined,
            };
            if (formatType === 'audio') httpF.vcodec = 'none';
            else {
              httpF.height = int_or_none(f.vertical_resolution) ?? undefined;
              httpF.width = int_or_none(f.horizontal_resolution) ?? undefined;
              httpF.vbr = float_or_none(f.video_bitrate) ?? undefined;
            }
            formats.push(httpF);
          }
        }
      }
    }

    const meta = (video.meta as Record<string, unknown>) || {};
    const title =
      (webpage ? this._og_search_title(webpage, false) : null) ||
      (meta.title as string | undefined);
    const description =
      (webpage ? this._og_search_description(webpage) : null) ||
      (meta.description as string | undefined);

    return {
      id: videoId,
      title,
      description: description || undefined,
      duration: (meta.length as number | undefined) ?? (meta.lenght as number | undefined),
      timestamp: parseIso8601(meta.addDate as string | undefined) ?? undefined,
      formats,
    };
  }
}

export class OnetMVPIE extends OnetBaseIE {
  static IE_NAME = 'onetmvp';
  static _VALID_URL = /onetmvp:(?<id>\d+\.\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractFromId(this._match_id(url));
  }
}

export class OnetIE extends OnetBaseIE {
  static IE_NAME = 'onet.tv';
  static _VALID_URL = new RegExp(`${URL_BASE_RE}[a-z]+\\/(?<display_id>[0-9a-z-]+)\\/(?<id>[0-9a-z]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, displayId);
    const mvpId = this._searchMvpId(webpage);
    const info = await this._extractFromId(mvpId, webpage);
    return { ...info, id: videoId, display_id: displayId };
  }
}

export class OnetChannelIE extends OnetBaseIE {
  static IE_NAME = 'onet.tv:channel';
  static _VALID_URL = new RegExp(`${URL_BASE_RE}(?<id>[a-z]+)(?:[?#]|$)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const webpage = await this._download_webpage(url, channelId);

    const currentClipInfo = this._parse_json<Record<string, unknown>>(
      this._search_regex(/var\s+currentClip\s*=\s*(\{[^}]+\})/, webpage, 'video info')!,
      channelId,
      (s) => js_to_json(s.replace(/'\s*\+\s*'/g, '')),
    )!;
    const videoId = remove_start(String(currentClipInfo.ckmId ?? ''), 'mvp:');

    const matches = [
      ...webpage.matchAll(
        new RegExp(`<a[^>]+href=['"](${URL_BASE_RE}[a-z]+\\/[0-9a-z-]+\\/[0-9a-z]+)`, 'gi'),
      ),
    ];
    if (matches.length <= 1 && videoId) {
      return this._extractFromId(videoId, webpage);
    }

    const entries = matches.map((m) => this.url_result(m[1]!, 'Onet'));

    const channelTitle = str_or_none(get_element_by_class('o_channelName', webpage)) ?? undefined;
    const channelDescription = str_or_none(get_element_by_class('o_channelDesc', webpage)) ?? undefined;
    return this.playlist_result(entries, channelId, channelTitle, channelDescription);
  }
}

export class OnetPlIE extends InfoExtractor {
  static IE_NAME = 'onet.pl';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?(?:onet|businessinsider\.com|plejada)\.pl\/(?:[^/]+\/)+(?<id>[0-9a-z]+)/;

  protected _searchMvpId(webpage: string, optional = false): string | null {
    return this._search_regex(
      /data-(?:params-)?mvp=["'](\d+\.\d+)/,
      webpage,
      'mvp id',
      null,
      !optional,
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let webpage = await this._download_webpage(url, videoId);
    let mvpId = this._searchMvpId(webpage, true);

    if (!mvpId) {
      const pulsembedUrl = this._search_regex(
        /data-src=(["'])(?<url>(?:https?:)?\/\/pulsembed\.eu\/[\s\S]+?)\1/,
        webpage,
        'pulsembed url',
      null,
      true,
      'url',
    )!;
      webpage = await this._download_webpage(pulsembedUrl, videoId, 'Downloading pulsembed webpage');
      mvpId = this._searchMvpId(webpage)!;
    }

    return this.url_result(`onetmvp:${mvpId}`, 'OnetMVP', mvpId);
  }
}
