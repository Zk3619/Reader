/**
 * AfreecaTVIE / AfreecaTVLiveIE / AfreecaTVUserIE / AfreecaTVCatchStoryIE — aligned with yt-dlp afreecatv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { filter_dict, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, urlencodePostdata, urljoin, UserNotLive } from './_helpers';

abstract class AfreecaTVBaseIE extends InfoExtractor {
  static _NETRC_MACHINE = 'afreecatv';

  protected async _callApi(
    endpoint: string,
    displayId: string,
    opts?: { data?: string; headers?: Record<string, string>; query?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `https://api.m.sooplive.com/${endpoint}`,
      displayId,
      'Downloading API JSON',
      {
        data: opts?.data,
        headers: opts?.headers,
        query: opts?.query,
        method: opts?.data ? 'POST' : 'GET',
      },
    );
  }

  protected _fixupThumb(thumbUrl: unknown): Thumbnail[] | undefined {
    const u = url_or_none(thumbUrl);
    return u ? [{ url: u }] : undefined;
  }

  protected _loginHint(method = 'password'): string {
    return method === 'password' ? 'Use --username and --password' : 'Login required';
  }
}

function cloudfrontAuthBody(m3u8Url: string, strmId: string, videoId: string): string {
  return urlencodePostdata({ type: 'vod', strm_id: strmId, title_no: videoId, url: m3u8Url });
}

export class AfreecaTVIE extends AfreecaTVBaseIE {
  static IE_NAME = 'soop';
  static IE_DESC = 'sooplive.com';
  static _VALID_URL = /https?:\/\/vod\.sooplive\.com\/(?:PLAYER\/STATION|player)\/(?<id>\d+)\/?(?:$|[?#&])/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const payload = await this._callApi('station/video/a/view', videoId, {
      headers: { Referer: url },
      data: urlencodePostdata({ nTitleNo: videoId, nApiLevel: 10 }),
    });
    const data = (payload.data || {}) as Record<string, unknown>;

    const needsPrivateAuth = traverse_obj(data, ['sub_upload_type', { expected_type: String }]);
    let strmId = '';
    if (needsPrivateAuth) {
      strmId = String(traverse_obj(data, ['bj_id']) || '');
      if (!strmId) throw new ExtractorError('Missing stream ID for subscriber VOD', { expected: true });
    }

    const errorCode = int_or_none(data.code);
    if (errorCode === -6221) throw new ExtractorError('The VOD does not exist', { expected: true });
    if (errorCode === -6205) throw new ExtractorError('This VOD is private', { expected: true });

    const commonInfo: Partial<VideoInfo> = {
      title: traverse_obj(data, ['title', { expected_type: String }]) as string | undefined,
      uploader: traverse_obj(data, ['writer_nick', { expected_type: String }]) as string | undefined,
      uploader_id: traverse_obj(data, ['bj_id', { expected_type: String }]) as string | undefined,
      duration: int_or_none(data.total_file_duration, 1000) ?? undefined,
      thumbnails: this._fixupThumb(data.thumb),
    };

    const entries: VideoInfo[] = [];
    const files = (data.files as Record<string, unknown>[]) || [];

    for (let i = 0; i < files.length; i++) {
      const fileElement = files[i]!;
      const fileUrl = url_or_none(fileElement.file);
      if (!fileUrl) continue;
      const fileNum = i + 1;
      let formats: Format[];

      if (/\.m3u8/i.test(fileUrl)) {
        if (needsPrivateAuth && strmId) {
          await this._request_webpage(
            {
              url: 'https://live.sooplive.com/api/private_auth.php',
              headers: {
                Referer: url,
                Origin: 'https://vod.sooplive.com',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              data: cloudfrontAuthBody(fileUrl, strmId, videoId),
            },
            videoId,
            'Requesting CloudFront cookies',
            { fatal: false },
          );
        }
        formats = await this._extract_m3u8_formats(
          fileUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          `Downloading part ${fileNum} m3u8 information`,
        );
        if (needsPrivateAuth) {
          for (const fmt of formats) fmt.protocol = 'soopvod';
        }
      } else {
        formats = [{ url: fileUrl, format_id: 'http' }];
      }

      entries.push({
        ...commonInfo,
        id: String(fileElement.file_info_key || `${videoId}_${fileNum}`),
        title: `${commonInfo.title || 'Untitled'} (part ${fileNum})`,
        formats,
        duration: int_or_none(fileElement.duration, 1000) ?? commonInfo.duration,
        timestamp:
          parseIso8601(fileElement.file_start, { delimiter: ' ', timezoneHours: 9 }) ?? undefined,
        webpage_url: url,
        original_url: url,
        extractor: 'soop',
        extractor_key: 'AfreecaTV',
      } as VideoInfo);
    }

    if (String(data.adult_status) === 'notLogin') {
      if (!entries.length) {
        this.raise_login_required(
          `Only users older than 19 are able to watch this video. ${this._loginHint('password')}`,
        );
      }
      this.report_warning(
        `In accordance with local laws, underage users are restricted from watching adult content. Only content suitable for all ages will be downloaded. ${this._loginHint('password')}`,
      );
    }

    if (!entries.length && traverse_obj(data, ['sub_upload_type', { expected_type: String }])) {
      this.raise_login_required(`This VOD is for subscribers only. ${this._loginHint('password')}`);
    }

    if (entries.length === 1) {
      return { ...entries[0]!, title: commonInfo.title || entries[0]!.title };
    }

    return this.playlist_result(entries, videoId, commonInfo.title || videoId);
  }
}

export class AfreecaTVCatchStoryIE extends AfreecaTVBaseIE {
  static IE_NAME = 'soop:catchstory';
  static IE_DESC = 'sooplive.com catch story';
  static _VALID_URL = /https?:\/\/vod\.sooplive\.com\/player\/(?<id>\d+)\/catchstory/i;

  private _entries(data: Record<string, unknown>): VideoInfo[] {
    const root = data.data;
    const blocks = Array.isArray(root) ? root : root ? [root] : [];
    const out: VideoInfo[] = [];
    for (const block of blocks as Record<string, unknown>[]) {
      if (String(block.story_type) !== 'catch') continue;
      for (const item of (block.catch_list as Record<string, unknown>[]) || []) {
        const file0 = ((item.files as Record<string, unknown>[]) || [])[0];
        const fileUrl = url_or_none(file0?.file);
        if (!fileUrl) continue;
        out.push({
          id: String(file0?.file_info_key || item.title || 'catch'),
          url: fileUrl,
          duration: int_or_none(file0?.duration, 1000) ?? undefined,
          title: String(item.title || ''),
          uploader: String(item.writer_nick || ''),
          uploader_id: String(item.writer_id || ''),
          thumbnails: this._fixupThumb(item.thumb),
          timestamp: int_or_none(item.write_timestamp) ?? undefined,
          extractor: 'soop:catchstory',
          extractor_key: 'AfreecaTVCatchStory',
        } as VideoInfo);
      }
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._callApi('catchstory/a/view', videoId, {
      headers: { Referer: url },
      query: { aStoryListIdx: '', nStoryIdx: videoId },
    });
    return this.playlist_result(this._entries(data), videoId);
  }
}

export class AfreecaTVLiveIE extends AfreecaTVBaseIE {
  static IE_NAME = 'soop:live';
  static IE_DESC = 'sooplive.com livestreams';
  static _VALID_URL = /https?:\/\/play\.sooplive\.com\/(?<id>[^/?#]+)(?:\/(?<bno>\d+))?/i;

  static _LIVE_API_URL = 'https://live.sooplive.com/afreeca/player_live_api.php';
  static _WORKING_CDNS = [
    'gcp_cdn',
    'gs_cdn_mobile_web',
    'gs_cdn_pc_web',
    'lg_cdn_pc_web',
    'lg_cdn_mobile_web',
    'azure_cdn',
    'aws_cf',
  ];
  static _BAD_CDNS = ['gs_cdn', 'gs_cdn_chromecast', 'lg_cdn_chromecast', 'gs_cdn_pc_app', 'kt_cdn'];

  protected _configurationArg(key: string, defaultVal: string[]): string[] {
    const args = (this.params as { extractor_args?: Record<string, Record<string, string | string[]>> })
      .extractor_args?.soop;
    const val = args?.[key];
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') return [val];
    return defaultVal;
  }

  protected async _extractFormats(
    channelInfo: Record<string, unknown>,
    broadcastNo: string,
  ): Promise<Format[]> {
    const streamBaseUrl = String(channelInfo.RMD || 'https://livestream-manager.sooplive.com');
    const fromChannel = (traverse_obj(channelInfo, ['CDN'], { get_all: true }) as string[]) || [];
    const defaultCdnIds = [
      ...new Set([
        ...fromChannel.filter((v) => !AfreecaTVLiveIE._BAD_CDNS.includes(v)),
        ...AfreecaTVLiveIE._WORKING_CDNS,
      ]),
    ];
    const cdnIds = this._configurationArg('cdn', defaultCdnIds);

    for (let attempt = 0; attempt < cdnIds.length; attempt++) {
      const cdnId = cdnIds[attempt]!;
      const streamInfo = await this._download_json<Record<string, unknown>>(
        urljoin(streamBaseUrl, 'broad_stream_assign.html'),
        broadcastNo,
        `Downloading ${cdnId} stream info`,
        {
          query: { return_type: cdnId, broad_key: `${broadcastNo}-common-master-hls` },
          fatal: false,
        },
      );
      const m3u8Url = url_or_none(streamInfo.view_url);
      if (!m3u8Url) continue;
      try {
        return await this._extract_m3u8_formats(
          m3u8Url,
          broadcastNo,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          true,
          { headers: { Referer: 'https://play.sooplive.com/' } },
        );
      } catch (e) {
        if (attempt === cdnIds.length - 1) throw e;
        this.report_warning(`${(e as Error).message}. Retrying... (attempt ${attempt + 1} of ${cdnIds.length})`);
      }
    }
    throw new ExtractorError('Unable to extract live formats', { expected: true });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    let broadcasterId = m!.groups!.id as string;
    let broadcastNo = m!.groups?.bno as string | undefined;

    const channelPayload = await this._download_json<Record<string, unknown>>(
      AfreecaTVLiveIE._LIVE_API_URL,
      broadcasterId,
      'Downloading live channel info',
      {
        data: urlencodePostdata({ bid: broadcasterId }),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    const channelInfo = (channelPayload.CHANNEL || {}) as Record<string, unknown>;

    broadcasterId = String(channelInfo.BJID || broadcasterId);
    broadcastNo = String(channelInfo.BNO || broadcastNo || '');

    if (!broadcastNo) {
      const result = int_or_none(channelInfo.RESULT);
      if (result === 0) throw new UserNotLive(broadcasterId);
      if (result === -6) {
        this.raise_login_required(
          `This channel is streaming for subscribers only. ${this._loginHint('password')}`,
        );
      }
      throw new ExtractorError('Unable to extract broadcast number', { expected: true });
    }

    const password = this.params.videopassword as string | undefined;
    if (channelInfo.BPWD === 'Y' && password == null) {
      throw new ExtractorError(
        'This livestream is protected by a password, use the --video-password option',
        { expected: true },
      );
    }

    const tokenPayload = await this._download_json<Record<string, unknown>>(
      AfreecaTVLiveIE._LIVE_API_URL,
      broadcastNo,
      'Downloading access token for stream',
      {
        data: urlencodePostdata(
          filter_dict({
            bno: broadcastNo,
            stream_type: 'common',
            type: 'aid',
            quality: 'master',
            pwd: password,
          }) as Record<string, string>,
        ),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    const tokenInfo = (tokenPayload.CHANNEL || {}) as Record<string, unknown>;
    const aid = String(tokenInfo.AID || '');
    if (!aid) {
      const result = int_or_none(tokenInfo.RESULT);
      if (result === 0) throw new ExtractorError('This livestream has ended', { expected: true });
      if (result === -6) {
        this.raise_login_required(`This livestream is for subscribers only. ${this._loginHint('password')}`);
      }
      throw new ExtractorError('Unable to extract access token', { expected: true });
    }

    void aid;
    const formats = await this._extractFormats(channelInfo, broadcastNo);
    const stationInfo =
      ((await this._download_json<Record<string, unknown>>(
        'https://st.sooplive.com/api/get_station_status.php',
        broadcastNo,
        'Downloading channel metadata',
        { query: { szBjId: broadcasterId }, fatal: false },
      )) as Record<string, unknown>) || {};

    return {
      id: broadcastNo,
      title: String(channelInfo.TITLE || stationInfo.station_title || broadcastNo),
      uploader: String(channelInfo.BJNICK || stationInfo.station_name || ''),
      uploader_id: broadcasterId,
      timestamp: parseIso8601(stationInfo.broad_start, { delimiter: ' ', timezoneHours: 9 }) ?? undefined,
      formats,
      is_live: true,
      http_headers: { Referer: url },
      webpage_url: url,
      original_url: url,
      extractor: 'soop:live',
      extractor_key: 'AfreecaTVLive',
    };
  }
}

export class AfreecaTVUserIE extends AfreecaTVBaseIE {
  static IE_NAME = 'soop:user';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?sooplive\.com\/station\/(?<id>[^/?#]+)\/vod\/?(?<slug_type>[^/?#]+)?/i;
  static _PER_PAGE = 60;

  protected async _fetchPage(userId: string, userType: string, page: number): Promise<VideoInfo[]> {
    const pageNum = page + 1;
    const info = await this._download_json<Record<string, unknown>>(
      `https://chapi.sooplive.com/api/${userId}/vods/${userType}`,
      userId,
      `Downloading ${userType} video page ${pageNum}`,
      {
        query: {
          page: String(pageNum),
          per_page: String(AfreecaTVUserIE._PER_PAGE),
          orderby: 'reg_date',
        },
      },
    );
    const rows = (info.data as Record<string, unknown>[]) || [];
    return rows.map((item) =>
      this.url_result(
        `https://vod.sooplive.com/player/${item.title_no}/`,
        'AfreecaTV',
        str_or_none(item.title_no) || undefined,
        str_or_none(item.title_name) || undefined,
      ),
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const userId = m!.groups!.id as string;
    const userType = (m!.groups?.slug_type as string | undefined) || 'all';

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 100; page++) {
      const batch = await this._fetchPage(userId, userType, page);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < AfreecaTVUserIE._PER_PAGE) break;
    }

    return this.playlist_result(entries, userId, `${userId} - ${userType}`);
  }
}
