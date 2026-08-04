// @ts-nocheck
/** UplynkBaseIE / UplynkIE / UplynkPreplayIE â€?ported from yt-dlp uplynk.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  smuggle_url,
  traverse_obj,
  unsmuggle_url,
  update_url_query,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

const UPLYNK_URL_RE =
  /https?:\/\/[\w-]+\.uplynk\.com\/(?<path>ext\/[0-9a-f]{32}\/(?<external_id>[^/?&]+)|(?<id>[0-9a-f]{32}))\.(?:m3u8|json)(?:.*?\bpbs=(?<session_id>[^&]+))?/;

export class UplynkBaseIE extends InfoExtractor {
  static IE_NAME = 'uplynkbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _UPLYNK_URL_RE = UPLYNK_URL_RE;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('UplynkBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractUplynkInfo(url: string): Promise<VideoInfo> {
    const [uplynkContentUrl, smuggledData] = unsmuggle_url(url, {});
    const mobj = uplynkContentUrl.match(UPLYNK_URL_RE);
    if (!mobj) throw new ExtractorError('Necessary parameters not found in Uplynk URL');
    const path = mobj.groups!.path!;
    const externalId = mobj.groups?.external_id;
    const videoId = mobj.groups?.id;
    const sessionId = mobj.groups?.session_id;
    const displayId = videoId || externalId || path;

    const headers = (traverse_obj(smuggledData, {
      Referer: 'Referer',
      Origin: 'Origin',
    }) || {}) as Record<string, string>;

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `http://content.uplynk.com/${path}.m3u8`,
      displayId,
      'hls',
    );
    // apply headers if present
    if (Object.keys(headers).length) {
      for (const f of formats) f.http_headers = { ...(f.http_headers || {}), ...headers };
    }
    if (sessionId) {
      for (const f of formats) f.extra_param_to_segment_url = `pbs=${sessionId}`;
    }

    const asset = await this._download_json<Record<string, unknown>>(
      `http://content.uplynk.com/player/assetinfo/${path}.json`,
      displayId,
    );
    if (asset.error === 1) {
      const msg = (asset.msg as string) || 'unknown error';
      throw new ExtractorError(`${this.IE_NAME} said: ${msg}`, { expected: true });
    }

    return {
      id: String(asset.asset),
      title: String(asset.desc || asset.asset),
      thumbnail: asset.default_poster_url as string | undefined,
      duration: float_or_none(asset.duration) ?? undefined,
      uploader_id: asset.owner as string | undefined,
      formats,
      subtitles: subtitles as Record<string, Subtitle[]>,
    };
  }
}

export class UplynkIE extends UplynkBaseIE {
  static IE_NAME = 'uplynk';
  static _VALID_URL = UPLYNK_URL_RE;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractUplynkInfo(url);
  }
}

export class UplynkPreplayIE extends UplynkBaseIE {
  static IE_NAME = 'uplynk:preplay';
  static _VALID_URL =
    /https?:\/\/[\w-]+\.uplynk\.com\/preplay2?\/(?<path>ext\/[0-9a-f]{32}\/(?<external_id>[^/?&]+)|(?<id>[0-9a-f]{32}))\.json/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggledData] = unsmuggle_url(url, {});
    const m = this._match_valid_url(cleanUrl)!;
    const path = m.groups!.path!;
    const externalId = m.groups?.external_id;
    const videoId = m.groups?.id;
    const displayId = videoId || externalId || path;
    const preplay = await this._download_json<Record<string, unknown>>(cleanUrl, displayId);
    let contentUrl = `http://content.uplynk.com/${path}.m3u8`;
    const sessionId = preplay.sid as string | undefined;
    if (sessionId) contentUrl = update_url_query(contentUrl, { pbs: sessionId });
    return this._extractUplynkInfo(smuggle_url(contentUrl, smuggledData));
  }
}
