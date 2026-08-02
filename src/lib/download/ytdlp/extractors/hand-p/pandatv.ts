/** PandaTvIE — ported from yt-dlp pandatv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, urlencodePostdata, UserNotLive } from './_helpers';

export class PandaTvIE extends InfoExtractor {
  static IE_NAME = 'pandatv';
  static _VALID_URL = /https?:\/\/(?:www\.|m\.)?pandalive\.co\.kr\/play\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const videoMeta = await this._download_json<Record<string, unknown>>(
      'https://api.pandalive.co.kr/v1/live/play',
      channelId,
      'Downloading video meta data',
      {
        data: urlencodePostdata({
          action: 'watch',
          userId: channelId,
          ...(this.params.videopassword ? { password: String(this.params.videopassword) } : {}),
        }),
      },
    );

    const errorCode = traverse_obj(videoMeta, ['errorData', 'code']) as string | undefined;
    if (errorCode) {
      if (errorCode === 'castEnd') throw new UserNotLive(channelId);
      if (errorCode === 'needAdult' || errorCode === 'needLogin') this.raise_login_required('Login is required for this stream');
      if (errorCode === 'needCoinPurchase') throw new ExtractorError('Coin purchase is required for this stream', { expected: true });
      if (errorCode === 'needUnlimitItem') throw new ExtractorError('Ticket purchase is required for this stream', { expected: true });
      if (errorCode === 'needPw') throw new ExtractorError('Password protected video, use --video-password <password>', { expected: true });
      if (errorCode === 'wrongPw') throw new ExtractorError('Wrong password', { expected: true });
      throw new ExtractorError(
        join_nonempty('API returned error code', errorCode, videoMeta.message ? `with error message: ${videoMeta.message}` : '', ' '),
        { expected: true },
      );
    }

    const httpHeaders = { Origin: 'https://www.pandalive.co.kr' };
    const hlsUrl = traverse_obj(videoMeta, ['PlayList', 'hls', 0, 'url']) as string;
    const formats: Format[] = await this._extract_m3u8_formats(
      hlsUrl,
      channelId,
      'mp4',
      'm3u8',
      undefined,
      undefined,
      'hls',
      undefined,
      true,
      { headers: httpHeaders },
    );

    const media = (videoMeta.media as Record<string, unknown>) || {};
    return {
      id: channelId,
      is_live: true,
      formats,
      http_headers: httpHeaders,
      title: str_or_none(media.title) ?? undefined,
      release_timestamp: parseIso8601(media.startTime) ?? undefined,
      thumbnail: url_or_none(media.ivsThumbnail) ?? undefined,
      channel: str_or_none(media.userNick) ?? undefined,
      concurrent_view_count: int_or_none((media.user as number | undefined)) ?? undefined,
      like_count: int_or_none(media.likeCnt) ?? undefined,
    };
  }
}
