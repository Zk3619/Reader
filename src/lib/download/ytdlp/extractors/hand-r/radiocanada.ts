/** RadioCanada* — ported from yt-dlp radiocanada.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unified_strdate } from '../../utils';

export class RadioCanadaIE extends InfoExtractor {
  static IE_NAME = 'radiocanada';
  static _VALID_URL =
    /(?:radiocanada:|https?:\/\/ici\.radio-canada\.ca\/widgets\/mediaconsole\/)(?<app_code>[^:/]+)[:/](?<id>[0-9]+)/;
  static _GEO_COUNTRIES = ['CA'];

  protected _access_token: string | null = null;
  protected _claims: string | null = null;

  protected async _callApi(path: string, videoId?: string, appCode?: string, query: Record<string, string> = {}) {
    const q: Record<string, string> = {
      client_key: '773aea60-0e80-41bb-9c7f-e6d7c3ad17fb',
      output: 'json',
      ...query,
    };
    if (videoId) {
      q.appCode = appCode!;
      q.idMedia = videoId;
    }
    if (this._access_token) q.access_token = this._access_token;
    try {
      return await this._download_json<Record<string, unknown>>(
        `https://services.radio-canada.ca/media/${path}`,
        videoId,
        undefined,
        { query: q },
      );
    } catch (e) {
      const status = (e as { cause?: { status?: number; response?: { text?: () => Promise<string> } } }).cause?.status;
      if (status === 401 || status === 422) {
        throw new ExtractorError(String(e), { expected: true });
      }
      throw e;
    }
  }

  protected async _extractInfo(appCode: string, videoId: string): Promise<VideoInfo> {
    const metaResp = await this._callApi('meta/v1/index.ashx', videoId, appCode);
    const metas = (metaResp.Metas as Array<Record<string, unknown>>) || [];
    const getMeta = (name: string): string | undefined => {
      for (const meta of metas) {
        if (meta.name === name) {
          const text = meta.text;
          if (text) return String(text);
        }
      }
      return undefined;
    };

    if (getMeta('protectionType')) {
      this.report_warning('This video is probably DRM protected.');
    }

    const vQuery: Record<string, string> = {
      connectionType: 'hd',
      deviceType: 'ipad',
      multibitrate: 'true',
    };
    if (this._claims) vQuery.claims = this._claims;
    const vData = await this._callApi('validation/v2/', videoId, appCode, vQuery);
    const vUrl = vData.url as string | undefined;
    if (!vUrl) {
      const error = (vData.message as string) || 'Unknown error';
      if (error === "Le contenu sélectionné n'est pas disponible dans votre pays") {
        this.raise_geo_restricted(error, RadioCanadaIE._GEO_COUNTRIES);
      }
      if (error === 'Le contenu sélectionné est disponible seulement en premium') {
        this.raise_login_required(error);
      }
      throw new ExtractorError(`${RadioCanadaIE.IE_NAME} said: ${error}`, { expected: true });
    }

    const formats: Format[] = await this._extract_m3u8_formats(vUrl, videoId, 'mp4');
    const subtitles: Record<string, Subtitle[]> = {};
    const ccUrl = getMeta('closedCaption') || getMeta('closedCaptionHTML5');
    if (ccUrl) {
      subtitles.fr = [{ url: ccUrl, ext: determine_ext(ccUrl, 'vtt') }];
    }

    return {
      id: videoId,
      title: getMeta('Title') || getMeta('AV-nomEmission'),
      description: getMeta('Description') || getMeta('ShortDescription'),
      thumbnail: getMeta('imageHR') || getMeta('imageMR') || getMeta('imageBR'),
      duration: int_or_none(getMeta('length')) ?? undefined,
      series: getMeta('Emission'),
      season_number: int_or_none(getMeta('SrcSaison')) ?? undefined,
      episode_number: int_or_none(getMeta('SrcEpisode')) ?? undefined,
      upload_date: unified_strdate(getMeta('Date')) ?? undefined,
      subtitles,
      formats,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    return this._extractInfo(m.groups!.app_code!, m.groups!.id!);
  }
}

export class RadioCanadaAudioVideoIE extends InfoExtractor {
  static IE_NAME = 'radiocanada:audiovideo';
  static _VALID_URL = /https?:\/\/ici\.radio-canada\.ca\/([^/]+\/)*media-(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(`radiocanada:medianet:${this._match_id(url)}`);
  }
}
