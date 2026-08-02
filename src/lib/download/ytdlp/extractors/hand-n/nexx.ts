/**
 * NexxIE / NexxEmbedIE — ported from yt-dlp nexx.py (main CDN paths; DRM/geo simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, parse_duration, traverse_obj, try_get } from '../../utils';
import { urlencodePostdata } from './_helpers';

const NEXX_VALID =
  /(?:https?:\/\/api\.nexx(?:\.cloud|cdn\.com)\/v3(?:\.\d)?\/(?<domain_id>\d+)\/videos\/byid\/|nexx:(?:(?<domain_id_s>\d+):)?|https?:\/\/arc\.nexx\.cloud\/api\/video\/)(?<id>\d+)/;

export class NexxIE extends InfoExtractor {
  static IE_NAME = 'nexx';
  static _VALID_URL = NEXX_VALID;

  protected _handleError(response: Record<string, unknown>): void {
    const ieName = (this.constructor as typeof NexxIE).IE_NAME;
    const notice = traverse_obj(response, ['metadata', 'notice']) as string | undefined;
    if (notice) this.report_warning(`${ieName}: ${notice}`);
    const status = int_or_none(try_get(response, (x) => (x as Record<string, Record<string, unknown>>).metadata?.status)) ?? 200;
    if (status >= 200 && status < 300) return;
    throw new ExtractorError(
      `${ieName}: ${traverse_obj(response, ['metadata', 'errorhint'])}`,
      { expected: true },
    );
  }

  protected async _callApi(
    domainId: string,
    path: string,
    videoId: string,
    data?: Record<string, string | number>,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const result = await this._download_json<Record<string, unknown>>(
      `https://api.nexx.cloud/v3/${domainId}/${path}`,
      videoId,
      `Downloading ${path} JSON`,
      {
        data: data ? urlencodePostdata(data) : undefined,
        method: data ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...headers },
      },
    );
    this._handleError(result);
    return result.result;
  }

  protected async _extractAzureFormats(video: Record<string, unknown>, videoId: string): Promise<Format[]> {
    const streamData = (video.streamdata as Record<string, unknown>) || {};
    const cdn = String(streamData.cdnType ?? 'azure');
    const azureLocator = String(streamData.azureLocator ?? '');

    const getShield = (shieldType = '', staticFile = false): string => {
      for (const secure of ['', 's']) {
        const shield = streamData[`cdnShield${shieldType}HTTP${secure.toUpperCase()}`] as string | undefined;
        if (shield) return `http${secure}:///${shield}`.replace(':///', '://');
      }
      const account = String(streamData.azureAccount ?? '').replace(/nexxplayplus|nexxplayfb/g, '');
      const prefix = String(streamData.azureAccount ?? '').includes('fb') ? (staticFile ? 'df' : 'f') : staticFile ? 'd' : 'p';
      const num = parseInt(account, 10) || 0;
      return `http://nx-${prefix}${String(num).padStart(2, '0')}.akamaized.net/`;
    };

    const general = (video.general as Record<string, unknown>) || {};
    const language = (general.language_raw as string) || '';
    const isMl = language.includes(',');
    let manifestUrl = `${getShield()}${azureLocator}/${videoId}_src${isMl ? '_manifest' : ''}.ism/Manifest`;
    const token = try_get(video, (x) => (x as Record<string, Record<string, string>>).protectiondata?.token);
    if (token) manifestUrl += `?hdnts=${token}`;

    const formats: Format[] = [];
    formats.push(
      ...(await this._extract_m3u8_formats(
        `${manifestUrl}(format=m3u8-aapl)`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        `${cdn}-hls`,
        undefined,
        false,
      )),
    );
    formats.push(...(await this._extract_mpd_formats(`${manifestUrl}(format=mpd-time-csf)`, videoId, `${cdn}-dash`, undefined, false)));

    const azureFd = streamData.azureFileDistribution as string | undefined;
    if (azureFd) {
      for (const fd of azureFd.split(',')) {
        const [tbrStr, dim] = fd.split(':');
        const tbr = int_or_none(tbrStr);
        if (!tbr) continue;
        const [w, h] = (dim || '').split('x');
        formats.push({
          format_id: `${cdn}-http-${tbr}`,
          url: `${getShield('Prog', true)}${azureLocator}/${videoId}_src_${dim}_${tbr}.mp4`,
          tbr,
          width: int_or_none(w) ?? undefined,
          height: int_or_none(h) ?? undefined,
        });
      }
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domainId = m.groups?.domain_id || m.groups?.domain_id_s || '748';
    const videoId = m.groups?.id ?? '';

    const findVideo = (result: unknown): Record<string, unknown> | undefined => {
      if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>;
      if (Array.isArray(result)) {
        const vid = parseInt(videoId, 10);
        return result.find((v) => int_or_none(try_get(v, (x) => (x as Record<string, Record<string, unknown>>).general?.ID)) === vid) as
          | Record<string, unknown>
          | undefined;
      }
      return undefined;
    };

    let video: Record<string, unknown> | undefined;
    const arcResp = await this._download_json<Record<string, unknown>>(
      `https://arc.nexx.cloud/api/video/${videoId}.json`,
      videoId,
      undefined,
      { fatal: false },
    );
    if (arcResp?.result) video = findVideo(arcResp.result);

    if (!video) {
      const deviceId = `${Math.floor(Math.random() * 4) + 1}:${Math.floor(Date.now() / 1000)}:${Math.floor(Math.random() * 90000) + 10000}${Math.floor(Math.random() * 9) + 1}`;
      const initResult = (await this._callApi(domainId, 'session/init', videoId, {
        nxp_devh: deviceId,
        nxp_userh: '',
        precid: '0',
        playlicense: '0',
        screenx: '1920',
        screeny: '1080',
        playerversion: '6.0.00',
        gateway: 'html5',
        adGateway: '',
        explicitlanguage: 'en-US',
        addTextTemplates: '1',
        addDomainData: '1',
        addAdModel: '1',
      }, { 'X-Request-Enable-Auth-Fallback': '1' })) as Record<string, unknown>;

      const general = (initResult.general as Record<string, unknown>) || {};
      const device = (initResult.device as Record<string, unknown>) || {};
      const cid = String(general.cid ?? '');
      const domainToken = String(device.domaintoken ?? '');
      const secret = domainToken.slice(parseInt(deviceId[0]!, 10)).slice(0, domainToken.length - parseInt(deviceId.slice(-1), 10));
      const requestToken = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`byid${domainId}${secret}`),
      ).then((buf) =>
        [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32),
      );

      const result = (await this._callApi(
        domainId,
        `videos/byid/${videoId}`,
        videoId,
        {
          additionalfields: 'language,channel,format,licenseby,slug,fileversion,episode,season',
          addInteractionOptions: '1',
          addStatusDetails: '1',
          addStreamDetails: '1',
          addFeatures: '1',
          addCaptions: 'vtt',
          addScenes: '1',
          addChapters: '1',
          addHotSpots: '1',
          addConnectedMedia: 'persons',
          addBumpers: '1',
        },
        { 'X-Request-CID': cid, 'X-Request-Token': requestToken },
      )) as unknown;
      video = findVideo(result);
    }

    if (!video) throw new ExtractorError('Unable to extract video metadata');

    const general = (video.general as Record<string, unknown>) || {};
    const streamData = (video.streamdata as Record<string, unknown>) || {};
    const cdn = String(streamData.cdnType ?? '');
    let formats: Format[] = [];
    if (cdn === 'azure') {
      formats = await this._extractAzureFormats(video, videoId);
    } else {
      this.raise_no_formats(`${cdn || 'unknown'} (${videoId}) formats are currently not supported`);
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (video.captiondata as Array<Record<string, unknown>>) || []) {
      const lang = (sub.language as string) || 'en';
      if (sub.url) {
        (subtitles[lang] ||= []).push({
          url: String(sub.url),
          ext: (sub.format as string) || 'vtt',
          name: (sub.language_long as string) || (sub.title as string),
        });
      }
    }

    return {
      id: videoId,
      title: String(general.title ?? videoId),
      alt_title: general.subtitle as string | undefined,
      description: general.description as string | undefined,
      release_year: int_or_none(general.year) ?? undefined,
      creator: (general.studio as string) || (general.studio_adref as string) || undefined,
      thumbnail: try_get(video, (x) => (x as Record<string, Record<string, string>>).imagedata?.thumb) || undefined,
      duration: parse_duration(general.runtime as string | undefined) ?? undefined,
      timestamp: int_or_none(general.uploaded) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class NexxEmbedIE extends InfoExtractor {
  static IE_NAME = 'nexx:embed';
  static _VALID_URL =
    /https?:\/\/embed\.nexx(?:\.cloud|cdn\.com)\/\d+\/(?:video\/)?(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const embedId = this._match_id(url);
    const webpage = await this._download_webpage(url, embedId);
    const apiMatch = webpage.match(/https?:\/\/api\.nexx(?:\.cloud|cdn\.com)\/v3\/\d+\/videos\/byid\/\d+/);
    if (!apiMatch) throw new ExtractorError('Unable to extract nexx API URL from embed');
    return this.url_result(apiMatch[0]!, 'Nexx') as VideoInfo;
  }
}
