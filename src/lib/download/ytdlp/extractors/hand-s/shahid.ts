/** Shahid family ù?ported from yt-dlp shahid.py (main AWS path) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

type AwsCredentials = {
  access_key: string;
  secret_key: string;
  uri: string;
  session_token?: string;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const raw = key instanceof ArrayBuffer ? key : key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function urlEncodeQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export class ShahidBaseIE extends InfoExtractor {
  static IE_NAME = 'shahid:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _AWS_PROXY_HOST = 'api2.shahid.net';
  static _AWS_API_KEY = '2RRtuMHx95aNI1Kvtn2rChEuwsCogUd4samGPjLh';
  static _VALID_URL_BASE = 'https://shahid.mbc.net/[a-z]{2}/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ShahidBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _awsExecuteApi<T = unknown>(
    awsDict: AwsCredentials,
    videoId: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const proxyHost = ShahidBaseIE._AWS_PROXY_HOST;
    const apiKey = ShahidBaseIE._AWS_API_KEY;
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const date = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Host: proxyHost,
      'X-Amz-Date': amzDate,
      'X-Api-Key': apiKey,
    };
    if (awsDict.session_token) headers['X-Amz-Security-Token'] = awsDict.session_token;

    const canonicalQuerystring = urlEncodeQuery(query);
    let canonicalHeaders = '';
    for (const headerName of Object.keys(headers).sort()) {
      canonicalHeaders += `${headerName.toLowerCase()}:${headers[headerName]}\n`;
    }
    const signedHeaders = Object.keys(headers)
      .sort()
      .map((h) => h.toLowerCase())
      .join(';');
    const canonicalRequest = ['GET', awsDict.uri, canonicalQuerystring, canonicalHeaders, signedHeaders, await sha256Hex('')].join('\n');
    const credentialScopeList = [date, 'us-east-1', 'execute-api', 'aws4_request'];
    const credentialScope = credentialScopeList.join('/');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

    let kSigning: BufferSource = new TextEncoder().encode(`AWS4${awsDict.secret_key}`);
    for (const value of credentialScopeList) {
      kSigning = new Uint8Array(await hmacSha256(kSigning, value));
    }
    const signature = [...new Uint8Array(await hmacSha256(kSigning, stringToSign))].map((b) => b.toString(16).padStart(2, '0')).join('');
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${awsDict.access_key}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const requestUrl = `https://${proxyHost}${awsDict.uri}${canonicalQuerystring ? `?${canonicalQuerystring}` : ''}`;
    return this._download_json<T>(requestUrl, videoId, 'AWS API request', { headers });
  }

  protected async _callApi(path: string, videoId: string, request?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (request) query.request = JSON.stringify(request);
    return this._awsExecuteApi(
      {
        uri: '/proxy/v2/' + path,
        access_key: 'AKIAI6X4TYCIXM2B7MUQ',
        secret_key: '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',
      },
      videoId,
      query,
    );
  }
}

export class ShahidIE extends ShahidBaseIE {
  static IE_NAME = 'shahid';
  static _NETRC_MACHINE = 'shahid';
  static _VALID_URL =
    /https?:\/\/shahid\.mbc\.net\/[a-z]{2}\/(?:serie|show|movie)s\/[^/]+\/(?<type>episode|clip|movie)-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let pageType = m.groups!.type!;
    const videoId = m.groups!.id!;
    if (pageType === 'clip') pageType = 'episode';

    const playoutResp = await this._callApi(`playout/new/url/${videoId}`, videoId);
    const playout = (playoutResp.playout as Record<string, unknown>) || {};
    if (!this.params.allow_unplayable_formats && playout.drm) this.report_drm(videoId);

    let m3u8Url = String(playout.url || '').replace(/aws\.manifestfilter=[\w:;,-]+&?/g, '');
    const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');

    const response = await this._download_json<{ data?: Record<string, unknown> }>(
      `http://api.shahid.net/api/v1_1/${pageType}/${videoId}`,
      videoId,
      'Downloading video JSON',
      {
        query: {
          apiKey: 'sh@hid0nlin3',
          hash: 'b2wMCTHpSmyxGqQjJFOycRmLSex+BpTK/ooxy6vHaqs=',
        },
      },
    );
    const data = response.data || {};
    const error = data.error as Record<string, string> | undefined;
    if (error) throw new ExtractorError(`${this.IE_NAME} returned error: ${Object.values(error).join('\n')}`, { expected: true });

    const video = (data[pageType] as Record<string, unknown>) || {};
    const categories = ((video.genres as Array<Record<string, unknown>>) || [])
      .map((g) => g.name as string)
      .filter(Boolean);

    return {
      id: videoId,
      title: video.title as string | undefined,
      description: video.description as string | undefined,
      thumbnail: video.thumbnailUrl as string | undefined,
      duration: int_or_none(video.duration) ?? undefined,
      timestamp: parseIso8601(video.referenceDate) ?? undefined,
      categories,
      series: (video.showTitle as string | undefined) || (video.showName as string | undefined),
      season: video.seasonTitle as string | undefined,
      season_number: int_or_none(video.seasonNumber) ?? undefined,
      season_id: str_or_none(video.seasonId) ?? undefined,
      episode_number: int_or_none(video.number) ?? undefined,
      episode_id: videoId,
      formats,
    };
  }
}

export class ShahidShowIE extends ShahidBaseIE {
  static IE_NAME = 'shahid:show';
  static _VALID_URL =
    /https?:\/\/shahid\.mbc\.net\/[a-z]{2}\/(?:show|serie)s\/[^/]+\/(?:show|series)-(?<id>\d+)/;
  static _PAGE_SIZE = 30;

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const product = await this._callApi('playableAsset', showId, { showId });
    const productModel = (product.productModel as Record<string, unknown>) || {};
    const playlist = (productModel.playlist as Record<string, unknown>) || {};
    const playlistId = playlist.id as string;
    const show = (productModel.show as Record<string, unknown>) || {};
    const count = int_or_none(playlist.count) || 0;
    const pages = Math.ceil(count / ShahidShowIE._PAGE_SIZE);

    const entries: VideoInfo[] = [];
    for (let page = 0; page < pages; page++) {
      const pageData = await this._callApi('product/playlist', showId, {
        playListId: playlistId,
        pageNumber: page,
        pageSize: ShahidShowIE._PAGE_SIZE,
        sorts: [{ order: 'DESC', type: 'SORTDATE' }],
      });
      const products = (((pageData.productList as Record<string, unknown>)?.products as Array<Record<string, unknown>>) || []);
      for (const p of products) {
        const productUrl = (p.productUrl as Record<string, unknown> | undefined)?.url as string | undefined;
        if (!productUrl) continue;
        entries.push(this.url_result(productUrl, 'Shahid', str_or_none(p.id) || undefined, p.title as string | undefined));
      }
    }

    return this.playlist_result(entries, showId, show.title as string | undefined, show.description as string | undefined);
  }
}
