/**
 * FourTubeBase / FourTube / Fux / PornTube / PornerBros ??yt-dlp fourtube.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  str_or_none,
  str_to_int,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

export class FourTubeBaseIE extends InfoExtractor {
  static IE_NAME = 'fourtubebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _URL_TEMPLATE = '';
  static _TKN_HOST = '';

  protected async _extractFormats(
    url: string,
    videoId: string,
    mediaId: string,
    sources: string[],
  ): Promise<Format[]> {
    const parsed = new URL(url);
    const tokenUrl = `https://${(this.constructor as typeof FourTubeBaseIE)._TKN_HOST}/${mediaId}/desktop/${sources.join('+')}`;
    const tokens = await this._download_json<Record<string, { token?: string }>>(
      tokenUrl,
      videoId,
      'Downloading stream tokens',
      {
        data: '',
        method: 'POST',
        headers: {
          Origin: `${parsed.protocol}//${parsed.hostname}`,
          Referer: url,
        },
      },
    );
    return sources.map((res) => ({
      url: tokens[res]?.token || '',
      format_id: `${res}p`,
      resolution: `${res}p`,
      quality: Number(res),
    }));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const Ctor = this.constructor as typeof FourTubeBaseIE;
    const m = this._match_valid_url(url)!;
    let videoId = m.groups!.id!;
    let displayId = m.groups!.display_id;
    const kind = m.groups!.kind;

    if (kind === 'm' || !displayId) {
      url = Ctor._URL_TEMPLATE.replace('%s', videoId);
    }

    const webpage = await this._download_webpage(url, videoId);
    const title = this._html_search_meta('name', webpage) || videoId;
    const timestamp = parseIso8601(this._html_search_meta('uploadDate', webpage, undefined, false) || '') ?? undefined;
    const thumbnail = this._html_search_meta('thumbnailUrl', webpage, undefined, false) ?? undefined;
    const uploaderId = this._html_search_regex(
      /<a class="item-to-subscribe" href="[^"]+\/(?:channel|user)s?\/([^/"]+)" title="Go to [^"]+ page">/,
      webpage,
      'uploader id',
      null,
      false,
    );
    const uploader = this._html_search_regex(
      /<a class="item-to-subscribe" href="[^"]+\/(?:channel|user)s?\/[^/"]+" title="Go to ([^"]+) page">/,
      webpage,
      'uploader',
      null,
      false,
    );

    const categoriesHtml = this._search_regex(
      /><i class="icon icon-tag"><\/i>\s*Categories \/ Tags\s*.*?<ul class="[^"]*?list[^"]*?">(.*?)<\/ul>/s,
      webpage,
      'categories',
      null,
      false,
    );
    const categories = categoriesHtml
      ? [...categoriesHtml.matchAll(/<li><a[\s\S]*?>(.*?)<\/a>/g)].map((x) => x[1]!.trim())
      : undefined;

    const viewCount = str_to_int(
      this._search_regex(
        /<meta[^>]+itemprop="interactionCount"[^>]+content="UserPlays:([0-9,]+)">/,
        webpage,
        'view count',
        null,
        false,
      ),
    );
    const likeCount = str_to_int(
      this._search_regex(
        /<meta[^>]+itemprop="interactionCount"[^>]+content="UserLikes:([0-9,]+)">/,
        webpage,
        'like count',
        null,
        false,
      ),
    );
    const duration = parse_duration(this._html_search_meta('duration', webpage, undefined, false) || '') ?? undefined;

    let mediaId = this._search_regex(
      /<button[^>]+data-id=(["'])(?<id>\d+)\1[^>]+data-quality=/,
      webpage,
      'media id',
      'id',
      false,
    );
    let sources = [...webpage.matchAll(/<button[^>]+data-quality=(["'])(.+?)\1/g)].map((x) => x[2]!);

    if (!mediaId || !sources.length) {
    const playerJsUrl = this._search_regex(
      /<script[^>]id=(["'])playerembed\1[^>]+src=(["'])(?<url>.+?)\2/,
      webpage,
      'player JS',
      'url',
    )!;
      const playerJs = await this._download_webpage(playerJsUrl, videoId, 'Downloading player JS');
      const paramsJs = this._search_regex(
        /\$\.ajax\(url,\ opts\);\s*\}\s*\}\)\(([0-9,\[\] ]+)\)/,
        playerJs,
        'initialization parameters',
      );
      const params = this._parse_json<unknown[]>(`[${paramsJs}]`, videoId) || [];
      mediaId = String(params[0]);
      sources = (params[2] as number[]).map(String);
    }

    const formats = await this._extractFormats(url, videoId, mediaId!, sources);

    return {
      id: videoId,
      title,
      formats,
      categories,
      thumbnail: thumbnail ?? undefined,
      uploader: uploader ?? undefined,
      uploader_id: uploaderId ?? undefined,
      timestamp,
      like_count: likeCount ?? undefined,
      view_count: viewCount ?? undefined,
      duration,
      age_limit: 18,
    };
  }
}

export class FourTubeIE extends FourTubeBaseIE {
  static IE_NAME = '4tube';
  static _VALID_URL =
    /https?:\/\/(?:(?<kind>www|m)\.)?4tube\.com\/(?:videos|embed)\/(?<id>\d+)(?:\/(?<display_id>[^/?#&]+))?/;
  static _URL_TEMPLATE = 'https://www.4tube.com/videos/%s/video';
  static _TKN_HOST = 'token.4tube.com';
}

export class FuxIE extends FourTubeBaseIE {
  static IE_NAME = 'fux';
  static _VALID_URL =
    /https?:\/\/(?:(?<kind>www|m)\.)?fux\.com\/(?:video|embed)\/(?<id>\d+)(?:\/(?<display_id>[^/?#&]+))?/;
  static _URL_TEMPLATE = 'https://www.fux.com/video/%s/video';
  static _TKN_HOST = 'token.fux.com';
}

export class PornTubeIE extends FourTubeBaseIE {
  static IE_NAME = 'porntube';
  static _VALID_URL =
    /https?:\/\/(?:(?<kind>www|m)\.)?porntube\.com\/(?:videos\/(?<display_id>[^/]+)_|embed\/)(?<id>\d+)/;
  static _URL_TEMPLATE = 'https://www.porntube.com/videos/video_%s';
  static _TKN_HOST = 'tkn.porntube.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id || videoId;
    const webpage = await this._download_webpage(url, displayId);
    const encoded = this._search_regex(
      /INITIALSTATE\s*=\s*(["'])(?<value>(?:(?!\1).)+)\1/,
      webpage,
      'data',
      'value',
    )!;
    const decoded = decodeURIComponent(
      typeof atob !== 'undefined' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('utf8'),
    );
    const video = (
      this._parse_json<Record<string, unknown>>(decoded, videoId)?.page as Record<string, unknown>
    )?.video as Record<string, unknown>;

    const title = String(video.title ?? videoId);
    const mediaId = String(video.mediaId ?? '');
    const sources = ((video.encodings as Array<Record<string, unknown>>) || [])
      .filter((e) => e.height)
      .map((e) => String(e.height));
    const formats = await this._extractFormats(url, videoId, mediaId, sources);

    return {
      id: videoId,
      title,
      formats,
      thumbnail: url_or_none(video.masterThumb) ?? undefined,
      uploader:
        try_get(video, (x) => (x as Record<string, unknown>).user as Record<string, unknown>)?.username as
          | string
          | undefined,
      uploader_id: str_or_none(
        try_get(video, (x) => (x as Record<string, unknown>).user as Record<string, unknown>)?.id as number,
      ) ?? undefined,
      channel: try_get(video, (x) => (x as Record<string, unknown>).channel as Record<string, unknown>)
        ?.name as string | undefined,
      channel_id: str_or_none(
        try_get(video, (x) => (x as Record<string, unknown>).channel as Record<string, unknown>)?.id as number,
      ) ?? undefined,
      timestamp: unified_timestamp(video.publishedAt) ?? undefined,
      like_count: int_or_none(video.likes) ?? undefined,
      dislike_count: int_or_none(video.dislikes) ?? undefined,
      view_count: int_or_none(video.playsQty) ?? undefined,
      duration: int_or_none(video.durationInSeconds) ?? undefined,
      age_limit: 18,
    };
  }
}

export class PornerBrosIE extends FourTubeBaseIE {
  static IE_NAME = 'pornerbros';
  static _VALID_URL =
    /https?:\/\/(?:(?<kind>www|m)\.)?pornerbros\.com\/(?:videos\/(?<display_id>[^/]+)_|embed\/)(?<id>\d+)/;
  static _URL_TEMPLATE = 'https://www.pornerbros.com/videos/video_%s';
  static _TKN_HOST = 'token.pornerbros.com';
}
