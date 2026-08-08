/**
 * LBRYBaseIE / LBRYIE / LBRYChannelIE / LBRYPlaylistIE — ported from yt-dlp lbry.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  mimetype2ext,
  parse_qs,
  str_or_none,
  traverse_obj,
  url_or_none,
  urlhandle_detect_ext,
} from '../../utils';
import { urljoin } from './_helpers';

const BASE_URL_REGEX =
  /(?:https?:\/\/(?:www\.)?(?:lbry\.tv|odysee\.com)\/|lbry:\/\/)/;
const CLAIM_ID_REGEX = /[0-9a-f]{1,40}/;
const OPT_CLAIM_ID = `[^$@:/?#&]+(?:[:#]${CLAIM_ID_REGEX.source})?`;

export class LBRYBaseIE extends InfoExtractor {
  static IE_NAME = 'lbrybase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _PAGE_SIZE = 50;
  protected _SUPPORTED_STREAM_TYPES = ['video', 'audio'];
  protected _UNSUPPORTED_STREAM_TYPES = ['binary'];

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LBRYBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApiProxy(
    method: string,
    displayId: string,
    params: Record<string, unknown>,
    resource: string,
  ): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json-rpc' };
    const cookies = this._get_cookies('https://odysee.com');
    if (cookies.auth_token) headers['x-lbry-auth-token'] = cookies.auth_token;

    const response = await this._download_json<{ result?: unknown; error?: { code?: unknown; message?: unknown } }>(
      'https://api.lbry.tv/api/v1/proxy',
      displayId,
      `Downloading ${resource} JSON metadata`,
      {
        method: 'POST',
        headers,
        data: JSON.stringify({ method, params }),
      },
    );
    if (response.error) {
      throw new ExtractorError(
        `${this.IE_NAME} said: ${response.error.code} - ${response.error.message}`,
        { expected: true },
      );
    }
    return response.result;
  }

  protected async _resolveUrl(uri: string, displayId: string, resource: string): Promise<Record<string, unknown>> {
    const result = (await this._callApiProxy('resolve', displayId, { urls: uri }, resource)) as Record<
      string,
      Record<string, unknown>
    >;
    return result[uri] || {};
  }

  protected _permanentUrl(pageUrl: string, claimName: string, claimId: string): string {
    return urljoin(pageUrl.replace('lbry://', 'https://lbry.tv/'), `/${claimName}:${claimId}`);
  }

  protected _parseStream(stream: Record<string, unknown>, pageUrl: string): Partial<VideoInfo> {
    const value = (stream.value as Record<string, unknown>) || {};
    const streamType = str_or_none(value.stream_type);
    const signingChannel = (stream.signing_channel as Record<string, unknown>) || {};

    const info: Partial<VideoInfo> = {
      title: str_or_none(value.title) ?? undefined,
      thumbnail: url_or_none(traverse_obj(value, ['thumbnail', 'url'])) ?? undefined,
      description: str_or_none(value.description) ?? undefined,
      license: str_or_none(value.license) ?? undefined,
      timestamp: int_or_none(stream.timestamp) ?? undefined,
      release_timestamp: int_or_none(value.release_time) ?? undefined,
      tags: Array.isArray(value.tags) ? (value.tags as string[]) : undefined,
      duration: int_or_none(traverse_obj(value, [streamType || '', 'duration'])) ?? undefined,
      channel: str_or_none(traverse_obj(signingChannel, ['value', 'title'])) ?? undefined,
      channel_id: str_or_none(signingChannel.claim_id) ?? undefined,
      uploader_id: str_or_none(signingChannel.name) ?? undefined,
    };

    if (info.uploader_id && info.channel_id) {
      info.channel_url = this._permanentUrl(pageUrl, String(info.uploader_id), String(info.channel_id));
    }
    return info;
  }

  protected async _fetchPage(
    displayId: string,
    pageUrl: string,
    params: Record<string, unknown>,
    page: number,
  ): Promise<VideoInfo[]> {
    const pageParams = { no_totals: true, page: page + 1, page_size: this._PAGE_SIZE, ...params };
    const result = (await this._callApiProxy('claim_search', displayId, pageParams, `page ${page + 1}`)) as {
      items?: Array<Record<string, unknown>>;
    };
    const entries: VideoInfo[] = [];
    for (const item of result.items || []) {
      if (!item.name || !item.claim_id) continue;
      entries.push({
        ...this._parseStream(item, pageUrl),
        _type: 'url',
        id: String(item.claim_id),
        url: this._permanentUrl(pageUrl, String(item.name), String(item.claim_id)),
        ie_key: 'LBRY',
      });
    }
    return entries;
  }

  protected async _playlistEntries(
    pageUrl: string,
    displayId: string,
    claimParam: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): Promise<VideoInfo> {
    const qs = parse_qs(pageUrl);
    const content = qs.content?.[0];
    const orderKey = qs.order?.[0] || 'new';
    const orderBy: Record<string, string[]> = {
      new: ['release_time'],
      top: ['effective_amount'],
      trending: ['trending_group', 'trending_mixed'],
    };

    const params: Record<string, unknown> = {
      fee_amount: qs.fee_amount?.[0] || '>=0',
      order_by: orderBy[orderKey] || orderBy.new,
      claim_type: 'stream',
      stream_types: content && ['audio', 'video'].includes(content) ? [content] : this._SUPPORTED_STREAM_TYPES,
      ...claimParam,
    };

    const duration = qs.duration?.[0];
    if (duration) params.duration = duration === 'long' ? '>=1200' : '<=240';

    const language = qs.language?.[0] || 'all';
    if (language !== 'all') {
      const languages = [language];
      if (language === 'en') languages.push('none');
      params.any_languages = languages;
    }

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 100; page++) {
      const batch = await this._fetchPage(displayId, pageUrl, params, page);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < this._PAGE_SIZE) break;
    }

    const metaValue = (metadata.value as Record<string, unknown>) || {};
    return this.playlist_result(
      entries,
      displayId,
      str_or_none(metaValue.title) ?? displayId,
      str_or_none(metaValue.description) ?? undefined,
    );
  }
}

export class LBRYIE extends LBRYBaseIE {
  static IE_NAME = 'lbry';
  static IE_DESC = 'odysee.com';
  static _VALID_URL = new RegExp(
    `${BASE_URL_REGEX.source}(?:\\$/(?:download|embed)/)?(?<id>[^$@:/?#]+/${CLAIM_ID_REGEX.source}|(?:@${OPT_CLAIM_ID}/)?${OPT_CLAIM_ID})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    let displayId = this._match_id(url);
    if (displayId.startsWith('@')) displayId = displayId.replace(':', '#');
    else displayId = displayId.replace('/', ':');
    displayId = decodeURIComponent(displayId);
    const uri = `lbry://${displayId}`;
    const result = await this._resolveUrl(uri, displayId, 'stream');
    const headers = {
      Referer: 'https://odysee.com/',
      // odycdn 大文件若带 gzip/br 易触发 reqwest “error decoding response body”
      'Accept-Encoding': 'identity',
    };

    const formats: Format[] = [];
    const value = (result.value as Record<string, unknown>) || {};
    const streamType = str_or_none(value.stream_type);
    let claimId = String(result.claim_id ?? '');
    let isLive = false;
    let finalUrl: string | null = null;

    if (streamType && this._SUPPORTED_STREAM_TYPES.includes(streamType)) {
      const qs = parse_qs(url);
      const getResult = (await this._callApiProxy(
        'get',
        claimId,
        {
          uri,
          signature: qs.signature?.[0],
          signature_ts: qs.signature_ts?.[0],
        },
        'streaming url',
      )) as Record<string, unknown>;

      const streamingUrl = String(getResult.streaming_url ?? '');
      // v3 API returns original file when available — probe with HEAD only (never full GET)
      const directUrl = streamingUrl.replace(/\/api\/v\d+\//, '/api/v3/');
      const directResp = await this._request_webpage(directUrl, displayId, 'Checking for original quality', {
        headers,
        method: 'HEAD',
        fatal: false,
      });
      if (directResp && urlhandle_detect_ext(directResp.url, 'unknown', directResp.headers) !== 'm3u8') {
        const source = (value.source as Record<string, unknown>) || {};
        formats.push({
          url: directUrl,
          format_id: 'original',
          quality: 1,
          protocol: 'https',
          ext:
            determine_ext(str_or_none(source.name)) ||
            mimetype2ext(str_or_none(source.media_type)) ||
            undefined,
          filesize: int_or_none(source.size) ?? undefined,
          width: int_or_none(traverse_obj(value, ['video', 'width'])) ?? undefined,
          height: int_or_none(traverse_obj(value, ['video', 'height'])) ?? undefined,
          vcodec: streamType === 'audio' ? 'none' : undefined,
          http_headers: { ...headers },
        });
      }

      // HEAD follows redirect to m3u8 when transcoded streams exist
      const headResp = await this._request_webpage(streamingUrl, displayId, 'Downloading streaming redirect url info', {
        headers,
        method: 'HEAD',
        fatal: false,
      });
      if (headResp?.url) finalUrl = headResp.url;
    } else if (
      result.value_type === 'stream' &&
      (!streamType || !this._UNSUPPORTED_STREAM_TYPES.includes(streamType))
    ) {
      claimId = String(traverse_obj(result, ['signing_channel', 'claim_id']) ?? '');
      isLive = true;
      const liveData = (
        await this._download_json<{ data?: Record<string, unknown> }>(
          'https://api.odysee.live/livestream/is_live',
          claimId,
          undefined,
          { query: { channel_claim_id: claimId } },
        )
      ).data || {};
      finalUrl = str_or_none(liveData.VideoURL);
      if (!liveData.Live) {
        finalUrl = null;
        this.raise_no_formats('This stream is not live', true);
      }
    } else {
      throw new ExtractorError(`Unsupported URL: ${url}`, { expected: true });
    }

    if (finalUrl && determine_ext(finalUrl) === 'm3u8') {
      const hls = await this._extract_m3u8_formats(
        finalUrl,
        displayId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
        { headers },
      );
      for (const f of hls) {
        f.http_headers = { ...(f.http_headers || {}), ...headers };
        formats.push(f);
      }
    }

    if (!formats.length) {
      this.raise_no_formats('No video formats found', true);
    }

    return {
      ...this._parseStream(result, url),
      id: claimId,
      formats,
      is_live: isLive,
      http_headers: headers,
    };
  }
}

export class LBRYChannelIE extends LBRYBaseIE {
  static IE_NAME = 'lbry:channel';
  static IE_DESC = 'odysee.com channels';
  static _VALID_URL = new RegExp(`${BASE_URL_REGEX.source}(?<id>@${OPT_CLAIM_ID})/?(?:[?&]|$)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url).replace(':', '#');
    const result = await this._resolveUrl(`lbry://${displayId}`, displayId, 'channel');
    const claimId = String(result.claim_id ?? displayId);
    return this._playlistEntries(url, claimId, { channel_ids: [claimId] }, result);
  }
}

export class LBRYPlaylistIE extends LBRYBaseIE {
  static IE_NAME = 'lbry:playlist';
  static IE_DESC = 'odysee.com playlists';
  static _VALID_URL = new RegExp(`${BASE_URL_REGEX.source}\\$/(?:play)?list/(?<id>[0-9a-f-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const result = (await this._callApiProxy(
      'claim_search',
      displayId,
      { claim_ids: [displayId], no_totals: true, page: 1, page_size: this._PAGE_SIZE },
      'playlist',
    )) as { items?: Array<Record<string, unknown>> };
    const item = result.items?.[0] || {};
    const claims = traverse_obj(item, ['value', 'claims']) as string[] | undefined;
    return this._playlistEntries(url, displayId, { claim_ids: claims || [] }, item);
  }
}
