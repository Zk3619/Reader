// @ts-nocheck
/** ZoomIE / ZoomClipsIE â€?ported from yt-dlp zoom.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  js_to_json,
  parse_filesize,
  parse_qs,
  parse_resolution,
  str_or_none,
  update_url_query,
  url_basename,
  urljoin,
} from '../../utils';

export class ZoomIE extends InfoExtractor {
  static IE_NAME = 'zoom';
  static _VALID_URL =
    /(?<base_url>https?:\/\/(?:[^.]+\.)?zoom\.us\/)rec(?:ording)?\/(?<type>play|share)\/(?<id>[\w.-]+)/;

  protected _get_page_data(webpage: string, videoId: string): Record<string, any> {
    return (
      this._search_json(/window\.__data__\s*=/, webpage, 'data', videoId, {
        transform_source: js_to_json,
      }) || {}
    );
  }

  protected async _get_real_webpage(
    url: string,
    baseUrl: string,
    videoId: string,
    urlType: string,
  ): Promise<string> {
    const webpage = await this._download_webpage(url, videoId, `Downloading ${urlType} webpage`);
    let form: Record<string, string>;
    try {
      form = this._form_hidden_inputs('password_form', webpage) as Record<string, string>;
    } catch {
      return webpage;
    }

    const password = this.get_param('videopassword');
    if (!password) {
      throw new ExtractorError(
        'This video is protected by a passcode, use the --video-password option',
        { expected: true },
      );
    }
    const isMeeting = form.useWhichPasswd === 'meeting';
    const validation = await this._download_json<Record<string, any>>(
      `${baseUrl}rec/validate${isMeeting ? '_meet' : ''}_passwd`,
      videoId,
      'Validating passcode',
      {
        data: new URLSearchParams({
          id: form[`${isMeeting ? 'meet' : 'file'}Id`] || '',
          passwd: password,
          action: form.action || '',
        }).toString(),
      },
    );
    if (!validation.status) {
      throw new ExtractorError(String(validation.errorMessage || 'Wrong passcode'), { expected: true });
    }
    return this._download_webpage(url, videoId, `Re-downloading ${urlType} webpage`);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const baseUrl = m?.groups?.base_url || '';
    const urlType = m?.groups?.type || 'play';
    const videoId = m?.groups?.id || this._match_id(url);
    const query: Record<string, string> = {};

    const startParams = (parse_qs(url).startTime?.[0] && { startTime: parse_qs(url).startTime[0] }) || {};
    if (urlType === 'share') {
      const shareWebpage = await this._get_real_webpage(url, baseUrl, videoId, 'share');
      const meetingId = String(this._get_page_data(shareWebpage, videoId).meetingId || '');
      const shareInfo = await this._download_json<Record<string, any>>(
        `${baseUrl}nws/recording/1.0/play/share-info/${meetingId}`,
        videoId,
        'Downloading share info JSON',
      );
      const redirectPath = String(shareInfo.result?.redirectUrl || '');
      url = update_url_query(urljoin(baseUrl, redirectPath), startParams);
      query.continueMode = 'true';
    }

    const webpage = await this._get_real_webpage(url, baseUrl, videoId, 'play');
    const fileId = String(this._get_page_data(webpage, videoId).fileId || '');
    if (!fileId) throw new ExtractorError('Unable to extract file ID');

    Object.assign(query, startParams);
    const data = (
      await this._download_json<Record<string, any>>(
        `${baseUrl}nws/recording/1.0/play/info/${fileId}`,
        videoId,
        'Downloading play info JSON',
        { query },
      )
    ).result || {};

    const subtitles: Record<string, Subtitle[]> = {};
    for (const k of ['transcript', 'cc', 'chapter']) {
      const u = data[`${k}Url`];
      if (!u) continue;
      subtitles[k] = [{ url: urljoin(baseUrl, String(u)), ext: 'vtt' }];
    }

    const formats: Format[] = [];
    if (data.viewMp4Url) {
      formats.push({
        format_note: 'Camera stream',
        url: data.viewMp4Url,
        width: int_or_none(data.viewResolvtions?.[0]) ?? undefined,
        height: int_or_none(data.viewResolvtions?.[1]) ?? undefined,
        format_id: 'view',
        ext: 'mp4',
        filesize_approx: parse_filesize(str_or_none(data.recording?.fileSizeInMB) || '') ?? undefined,
        preference: 0,
      });
    }
    if (data.shareMp4Url) {
      formats.push({
        format_note: 'Screen share stream',
        url: data.shareMp4Url,
        width: int_or_none(data.shareResolvtions?.[0]) ?? undefined,
        height: int_or_none(data.shareResolvtions?.[1]) ?? undefined,
        format_id: 'share',
        ext: 'mp4',
        preference: -1,
      });
    }
    const mixed = str_or_none(data.viewMp4WithshareUrl);
    if (mixed) {
      const basename = url_basename(mixed) || '';
      const resolution = this._search_regex(/_(\d+x\d+)\.mp4/, basename, 'resolution', null, false);
      formats.push({
        ...(parse_resolution(resolution || '') || {}),
        format_note: 'Screen share with camera',
        url: mixed,
        format_id: 'view_with_share',
        ext: 'mp4',
        preference: 1,
      });
    }

    return {
      id: videoId,
      title: str_or_none(data.meet?.topic) || videoId,
      duration: int_or_none(data.duration) ?? undefined,
      subtitles,
      formats,
      http_headers: { Referer: baseUrl },
    };
  }
}

export class ZoomClipsIE extends InfoExtractor {
  static IE_NAME = 'zoom:clips';
  static _VALID_URL = /https?:\/\/(?:[^.]+\.)?zoom\.us\/clips\/share\/(?<id>[\w.-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const clipId = this._match_id(url);
    const result = (
      await this._download_json<Record<string, any>>(
        `https://zoomclips.zoom.us/nws/marvel/2.0/clips/share/${clipId}`,
        clipId,
        'Downloading share info JSON',
      )
    ).result || {};
    const mediaInfo = (result.mediaInfo || {}) as Record<string, any>;

    return {
      id: clipId,
      title: str_or_none(mediaInfo.mediaTopic) || clipId,
      uploader: str_or_none(mediaInfo.ownerName) || undefined,
      release_timestamp: int_or_none(mediaInfo.createdTime, 1000) ?? undefined,
      duration: int_or_none(mediaInfo.mediaDuration) ?? undefined,
      view_count: int_or_none(result.statisticsInfo?.count) ?? undefined,
      formats: mediaInfo.playUrl
        ? [
            {
              url: String(mediaInfo.playUrl),
              protocol: 'm3u8_native',
              ext: 'mp4',
            },
          ]
        : [],
    };
  }
}
