/**
 * FancodeLive / FancodeVod â€?ported from yt-dlp fancode.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { mimetype2ext, try_get } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

const BRIGHTCOVE_USER_ID = '6008340455001';

export class FancodeVodIE extends InfoExtractor {
  static IE_NAME = 'fancode:vod';
  static _VALID_URL = /https?:\/\/(?:www\.)?fancode\.com\/video\/(?<id>[0-9]+)\b/;
  static _NETRC_MACHINE = 'fancode';

  protected _accessToken: string | null = null;

  protected _checkLoginRequired(isAvailable: unknown, isPremium: unknown): void {
    let msg: string | null = null;
    if (isPremium && !this._accessToken) {
      msg =
        'This video is only available for registered users. Use "--username refresh --password <refresh_token>" to login using a refresh token';
    } else if (!isAvailable && this._accessToken) {
      msg = "This video isn't available to the current logged in account";
    }
    if (msg) this.raise_login_required(msg, true, null);
  }

  protected async downloadGql(
    variable: string,
    data: string,
    note: string,
    fatal = false,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin: 'https://fancode.com',
      referer: 'https://fancode.com',
    };
    if (this._accessToken) headers.Authorization = `Bearer ${this._accessToken}`;
    return this._download_json<Record<string, unknown>>(
      'https://www.fancode.com/graphql',
      variable,
      note,
      {
        data,
        method: 'POST',
        headers,
        fatal,
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = `{"query":"query Video($id: Int!, $filter: SegmentFilter) { media(id: $id, filter: $filter) { id contentId title contentId publishedTime totalViews totalUpvotes provider thumbnail { src } mediaSource {brightcove } duration isPremium isUserEntitled tags duration }}","variables":{"id":${videoId},"filter":{"contentDataType":"DEFAULT"}},"operationName":"Video"}`;

    const metadataJson = await this.downloadGql(videoId, data, 'Downloading metadata');
    const media = (try_get(metadataJson, (x) => (x as Record<string, unknown>).data) as Record<string, unknown>)
      ?.media as Record<string, unknown> | undefined;
    const brightcoveVideoId = try_get(
      media,
      (x) => (x as Record<string, unknown>).mediaSource as Record<string, unknown>,
    ) as Record<string, unknown> | undefined;
    const bcId = try_get(brightcoveVideoId, (x) => (x as Record<string, unknown>).brightcove) as string | undefined;

    if (!bcId) throw new ExtractorError('Unable to extract brightcove Video ID');

    const isPremium = media?.isPremium;
    this._checkLoginRequired(media?.isUserEntitled, isPremium);

    return {
      _type: 'url_transparent',
      url: `https://players.brightcove.net/${BRIGHTCOVE_USER_ID}/default_default/index.html?videoId=${bcId}`,
      ie_key: 'BrightcoveNew',
      id: videoId,
      title: String(media?.title ?? videoId),
      like_count: typeof media?.totalUpvotes === 'number' ? media.totalUpvotes : undefined,
      view_count: typeof media?.totalViews === 'number' ? media.totalViews : undefined,
      tags: Array.isArray(media?.tags) ? (media.tags as string[]) : undefined,
      release_timestamp: parseIso8601(media?.publishedTime) ?? undefined,
      availability: isPremium ? 'premium_only' : undefined,
    };
  }
}

export class FancodeLiveIE extends FancodeVodIE {
  static IE_NAME = 'fancode:live';
  static _VALID_URL = /https?:\/\/(?:www\.)?fancode\.com\/match\/(?<id>[0-9]+).+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = `{"query":"query MatchResponse($id: Int!, $isLoggedIn: Boolean!) { match: matchWithScores(id: $id) { id matchDesc mediaId videoStreamId videoStreamUrl { url deliveryType } liveStreams { videoStreamId videoStreamUrl { url deliveryType } contentId } name startTime streamingStatus isPremium isUserEntitled @include(if: $isLoggedIn) status metaTags bgImage { src } sport { name slug } tour { id name } squads { name shortName } liveStreams { contentId } mediaId }}","variables":{"id":${videoId},"isLoggedIn":true},"operationName":"MatchResponse"}`;

    const infoJson = await this.downloadGql(videoId, data, 'Info json');
    const matchInfo = try_get(infoJson, (x) => (x as Record<string, unknown>).data) as
      | Record<string, unknown>
      | undefined;
    const match = matchInfo?.match as Record<string, unknown> | undefined;

    if (match?.streamingStatus !== 'STARTED') {
      throw new ExtractorError("The stream can't be accessed", { expected: true });
    }
    this._checkLoginRequired(match?.isUserEntitled, true);

    const streamUrl = (match?.videoStreamUrl as Record<string, unknown> | undefined)?.url as string;
    const formats: Format[] = [];
    if (streamUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'akamai');
      formats.push(...res.formats);
    }

    return {
      id: videoId,
      title: typeof match?.name === 'string' ? match.name : videoId,
      formats,
      ext: mimetype2ext(String((match?.videoStreamUrl as Record<string, unknown>)?.deliveryType)) || 'mp4',
      is_live: true,
      release_timestamp: parseIso8601(match?.startTime) ?? undefined,
    };
  }
}
