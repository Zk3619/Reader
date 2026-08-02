/**
 * TouTvIE — ported from yt-dlp toutv.py (RadioCanada base inlined)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unified_strdate } from '../../utils';

abstract class RadioCanadaBaseIE extends InfoExtractor {
  static _GEO_COUNTRIES = ['CA'];
  protected _accessToken: string | null = null;
  protected _claims: string | null = null;

  protected async _callApi(
    path: string,
    videoId?: string,
    appCode?: string,
    query: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const q: Record<string, string> = {
      ...query,
      client_key: '773aea60-0e80-41bb-9c7f-e6d7c3ad17fb',
      output: 'json',
    };
    if (videoId && appCode) {
      q.appCode = appCode;
      q.idMedia = videoId;
    }
    if (this._accessToken) q.access_token = this._accessToken;

    try {
      return await this._download_json<Record<string, unknown>>(
        `https://services.radio-canada.ca/media/${path}`,
        videoId,
        undefined,
        { query: q },
      );
    } catch (e) {
      if (e instanceof ExtractorError && e.message) throw e;
      throw e;
    }
  }

  protected async _extractInfo(appCode: string, videoId: string): Promise<VideoInfo> {
    const metas = ((await this._callApi('meta/v1/index.ashx', videoId, appCode)).Metas ||
      []) as Array<Record<string, unknown>>;

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

    const query: Record<string, string> = {
      connectionType: 'hd',
      deviceType: 'ipad',
      multibitrate: 'true',
    };
    if (this._claims) query.claims = this._claims;

    const vData = await this._callApi('validation/v2/', videoId, appCode, query);
    const vUrl = vData.url as string | undefined;
    if (!vUrl) {
      const error = String(vData.message || 'Unknown error');
      if (error.includes("n'est pas disponible dans votre pays")) {
        this.raise_geo_restricted(error, RadioCanadaBaseIE._GEO_COUNTRIES);
      }
      if (error.includes('seulement en premium')) {
        this.raise_login_required(error);
      }
      throw new ExtractorError(`RadioCanada said: ${error}`, { expected: true });
    }

    const formats = await this._extract_m3u8_formats(vUrl, videoId, 'mp4');
    const subtitles: Record<string, Subtitle[]> = {};
    const cc =
      getMeta('closedCaption') || getMeta('closedCaptionHTML5');
    if (cc) {
      subtitles.fr = [{ url: cc, ext: determine_ext(cc, 'vtt') }];
    }

    return {
      id: videoId,
      title: getMeta('Title') || getMeta('AV-nomEmission') || videoId,
      description: getMeta('Description') || getMeta('ShortDescription'),
      thumbnail: getMeta('imageHR') || getMeta('imageMR') || getMeta('imageBR'),
      duration: int_or_none(getMeta('length')) ?? undefined,
      series: getMeta('Emission'),
      season_number: int_or_none(getMeta('SrcSaison')) ?? undefined,
      episode_number: int_or_none(getMeta('SrcEpisode')) ?? undefined,
      upload_date: unified_strdate(getMeta('Date')) || undefined,
      subtitles,
      formats,
    };
  }
}

export class TouTvIE extends RadioCanadaBaseIE {
  static IE_NAME = 'tou.tv';
  static _NETRC_MACHINE = 'toutv';
  static _VALID_URL = /https?:\/\/ici\.tou\.tv\/(?<id>[a-zA-Z0-9_-]+(?:\/S[0-9]+[EC][0-9]+)?)/;
  static _CLIENT_KEY = '90505c8d-9c34-4f34-8da1-3a85bdc6d4f4';

  protected async _performLogin(username: string, password: string): Promise<void> {
    try {
      const login = await this._download_json<{ access_token?: string }>(
        'https://services.radio-canada.ca/toutv/profiling/accounts/login',
        undefined,
        'Logging in',
        {
          method: 'POST',
          data: JSON.stringify({
            ClientId: TouTvIE._CLIENT_KEY,
            ClientSecret: '34026772-244b-49b6-8b06-317b30ac9a20',
            Email: username,
            Password: password,
            Scope: 'id.write media-validation.read',
          }),
          headers: {
            Authorization: `client-key ${TouTvIE._CLIENT_KEY}`,
            'Content-Type': 'application/json;charset=utf-8',
          },
        },
      );
      this._accessToken = login.access_token || null;
    } catch (e) {
      throw new ExtractorError(e instanceof Error ? e.message : 'Login failed', { expected: true });
    }
    const claimsResp = await this._callApi('validation/v2/getClaims');
    this._claims = String(claimsResp.claims || '');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const path = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://services.radio-canada.ca/toutv/presentation/${path}`,
      path,
      undefined,
      {
        query: { client_key: TouTvIE._CLIENT_KEY, device: 'web', version: '4' },
      },
    );

    if (!this.params.allow_unplayable_formats && metadata.IsDrm) {
      this.report_warning('This video is probably DRM protected.');
    }

    const videoId = String(metadata.IdMedia);
    const details = (metadata.Details || {}) as Record<string, unknown>;
    const streamInfo = await this._extractInfo(String(metadata.AppCode || 'toutv'), videoId);

    return {
      id: videoId,
      title: (details.OriginalTitle as string) || streamInfo.title,
      description: (details.Description as string) || streamInfo.description,
      thumbnail: (details.ImageUrl as string) || streamInfo.thumbnail,
      duration: int_or_none(details.LengthInSeconds) ?? streamInfo.duration,
      series: metadata.ProgramTitle as string | undefined,
      season_number: int_or_none(metadata.SeasonNumber) ?? undefined,
      season: metadata.SeasonTitle as string | undefined,
      episode_number: int_or_none(metadata.EpisodeNumber) ?? undefined,
      episode: metadata.EpisodeTitle as string | undefined,
      formats: streamInfo.formats,
      subtitles: streamInfo.subtitles,
      upload_date: streamInfo.upload_date,
    };
  }
}
