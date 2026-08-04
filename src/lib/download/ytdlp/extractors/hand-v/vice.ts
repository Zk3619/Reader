// @ts-nocheck
/** ViceBaseIE / ViceIE / ViceShowIE / ViceArticleIE â€?ported from yt-dlp vice.py */

import { createHash, randomInt } from 'node:crypto';
import { ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, try_get } from '../../utils';
import { AdobePassIE } from '../hand-bases';
import { extractYoutubeEmbedUrl, parse_age_limit } from './_helpers';

const SOFTWARE_STATEMENT =
  'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIwMTVjODBlZC04ZDcxLTQ4ZGEtOTZkZi00NzU5NjIwNzJlYTQiLCJuYmYiOjE2NjgwMTM0ODQsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNjY4MDEzNDg0fQ.CjhUnTrlh-bmYnEFHyC2Y4it5Y_Zfza1x66O4-ki5gBR7JT6aUunYI_YflXomQPACriMpObkITFz4grVaDwdd8Xp9hrQ2R0SwRBdaklkdy1_j68RqSP5PnexJIa0q_ThtOwfRBd5uGcb33nMJ9Qs92W4kVXuca0Ta-i7SJyWgXUaPDlRDdgyCL3hKj5wuM7qUIwrd9A5CMm-j3dMIBCDgw7X6TwRK65eUQe6gTWqcvL2yONHHTpmIfeOTUxGwwKFr29COOTBowm0VJ6HE08xjXCShP08Neusu-JsgkjzhkEbiDE2531EKgfAki_7WCd2JUZVsAsCusv4a1maokk6NA';

function extractViceEmbedUrl(html: string): string | null {
  const m = html.match(
    /<iframe\b[^>]+\bsrc=["'](?<url>(?:https?:)?\/\/video\.vice\.com\/[^/]+\/embed\/[\da-f]{24})/i,
  );
  return m?.groups?.url || m?.[1] || null;
}

/** Base for Vice GraphQL API â€?no standalone URL match. */
export class ViceBaseIE extends AdobePassIE {
  static IE_NAME = 'vice:base';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async _call_api(
    resource: string,
    resourceKey: string,
    resourceId: string,
    locale: string,
    fields: string,
    args = '',
  ): Promise<unknown> {
    const data = await this._download_json<{ data: Record<string, unknown> }>(
      'https://video.vice.com/api/v1/graphql',
      resourceId,
      undefined,
      {
        query: {
          query: `{
  ${resource}(locale: "${locale}", ${resourceKey}: "${resourceId}"${args}) {
    ${fields}
  }
}`,
        },
      },
    );
    return data.data[resource];
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ViceBaseIE is not a standalone extractor', { expected: true });
  }
}

// @ts-expect-error AdobePassIE._VALID_URL is false; subclasses override
export class ViceIE extends ViceBaseIE {
  static IE_NAME = 'vice';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:(?:video|vms)\.vice|(?:www\.)?vice(?:land|tv))\.com\/(?<locale>[^/]+)\/(?:video\/[^/]+|embed)\/(?<id>[\da-f]{24})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const locale = m.groups!.locale!;
    const videoId = m.groups!.id!;

    const videos = (await this._call_api(
      'videos',
      'id',
      videoId,
      locale,
      `body
    locked
    rating
    thumbnail_url
    title`,
    )) as Array<Record<string, unknown>>;
    const video = videos[0]!;
    const title = String(video.title || '').trim();
    const rating = video.rating != null ? String(video.rating) : undefined;

    const query: Record<string, string | number> = {};
    if (video.locked) {
      const resource = AdobePassIE._get_mvpd_resource('VICELAND', title, videoId, rating || '');
      query.tvetoken = await this._extract_mvpd_auth(
        url,
        videoId,
        'VICELAND',
        resource,
        SOFTWARE_STATEMENT,
      );
    }

    const exp = Math.trunc(Date.now() / 1000) + 1440;
    Object.assign(query, {
      exp,
      sign: createHash('sha512').update(`${videoId}:GET:${exp}`).digest('hex'),
      skipadstitching: 1,
      platform: 'desktop',
      rn: randomInt(10000, 100000),
    });

    let preplay: Record<string, unknown>;
    try {
      preplay = await this._download_json<Record<string, unknown>>(
        `https://vms.vice.com/${locale}/video/preplay/${videoId}`,
        videoId,
        undefined,
        { query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) },
      );
    } catch (e) {
      throw e instanceof ExtractorError
        ? e
        : new ExtractorError(String(e), { expected: true });
    }

    const videoData = (preplay.video as Record<string, unknown>) || {};
    const formats: Format[] = await this._extract_m3u8_formats(
      String(preplay.playURL),
      videoId,
      'mp4',
      'm3u8_native',
    );
    const episode = (videoData.episode as Record<string, unknown>) || {};
    const channel = (videoData.channel as Record<string, unknown>) || {};
    const season = (videoData.season as Record<string, unknown>) || {};

    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of (preplay.subtitleURLs as Array<Record<string, unknown>>) || []) {
      const ccUrl = subtitle.url as string | undefined;
      if (!ccUrl) continue;
      const languageCode =
        (try_get(subtitle, (x) =>
          ((x as Record<string, unknown>).languages as Array<Record<string, unknown>>)[0]
            ?.language_code,
        ) as string) || 'en';
      (subtitles[languageCode] ||= []).push({ url: ccUrl });
    }

    return {
      formats,
      id: videoId,
      title,
      description: clean_html(video.body as string) || undefined,
      thumbnail: video.thumbnail_url != null ? String(video.thumbnail_url) : undefined,
      duration: int_or_none(videoData.video_duration) ?? undefined,
      timestamp: int_or_none(videoData.created_at, 1000) ?? undefined,
      age_limit:
        parse_age_limit(
          (videoData.video_rating as string) || rating || undefined,
        ) ?? undefined,
      series: try_get(videoData, (x) =>
        String(
          (((x as Record<string, unknown>).show as Record<string, unknown>)?.base as Record<
            string,
            unknown
          >)?.display_title || '',
        ),
      ) || undefined,
      episode_number: int_or_none(episode.episode_number) ?? undefined,
      episode_id: str_or_none(episode.id || videoData.episode_id) || undefined,
      season_number: int_or_none(season.season_number) ?? undefined,
      season_id: str_or_none(season.id || videoData.season_id) || undefined,
      uploader: channel.name != null ? String(channel.name) : undefined,
      uploader_id: str_or_none(channel.id) || undefined,
      subtitles,
    };
  }
}

export class ViceShowIE extends ViceBaseIE {
  static IE_NAME = 'vice:show';
  static _WORKING = false;
  static _PAGE_SIZE = 25;
  static _VALID_URL =
    /https?:\/\/(?:video\.vice|(?:www\.)?vice(?:land|tv))\.com\/(?<locale>[^/]+)\/show\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const locale = m.groups!.locale!;
    const displayId = m.groups!.id!;

    const shows = (await this._call_api(
      'shows',
      'slug',
      displayId,
      locale,
      `dek
    id
    title`,
    )) as Array<Record<string, unknown>>;
    const show = shows[0]!;
    const showId = String(show.id);

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 40; page++) {
      const videos = (await this._call_api(
        'videos',
        'show_id',
        showId,
        locale,
        `body
    id
    url`,
        `, page: ${page + 1}, per_page: ${ViceShowIE._PAGE_SIZE}`,
      )) as Array<Record<string, unknown>> | null;
      if (!videos?.length) break;
      for (const video of videos) {
        if (video.url) {
          entries.push(this.url_result(String(video.url), 'vice', video.id != null ? String(video.id) : undefined));
        }
      }
      if (videos.length < ViceShowIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      showId,
      show.title != null ? String(show.title) : undefined,
      show.dek != null ? String(show.dek) : undefined,
    );
  }
}

export class ViceArticleIE extends ViceBaseIE {
  static IE_NAME = 'vice:article';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vice\.com\/(?<locale>[^/]+)\/article\/(?:[0-9a-z]{6}\/)?(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const locale = m.groups!.locale!;
    const displayId = m.groups!.id!;

    const articles = (await this._call_api(
      'articles',
      'slug',
      displayId,
      locale,
      `body
    embed_code`,
    )) as Array<Record<string, unknown>>;
    const article = articles[0]!;
    const body = String(article.body || '');

    const urlRes = (videoUrl: string, ieKey: string): VideoInfo => ({
      _type: 'url_transparent',
      url: videoUrl,
      id: displayId,
      display_id: displayId,
      title: displayId,
      ie_key: ieKey,
      extractor: ieKey,
      extractor_key: ieKey,
    });

    const viceUrl = extractViceEmbedUrl(body);
    if (viceUrl) return urlRes(viceUrl, 'vice');

    const youtubeUrl = extractYoutubeEmbedUrl(body);
    if (youtubeUrl) return urlRes(youtubeUrl, 'Youtube');

    const videoUrl = this._html_search_regex(
      /data-video-url="([^"]+)"/,
      String(article.embed_code || ''),
      'video URL',
    )!;
    return urlRes(videoUrl, 'vice');
  }
}
