/** STVPlayerIE — ported from yt-dlp stv.py */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, smuggle_url, str_or_none, try_get } from '../../utils';
import { searchNextjsData } from './_helpers';

export class STVPlayerIE extends InfoExtractor {
  static IE_NAME = 'stv:player';
  static _VALID_URL = /https?:\/\/player\.stv\.tv\/(?<type>episode|video)\/(?<id>[a-z0-9]{4})/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/1486976045/default_default/index.html?videoId=%s';
  static _PTYPE_MAP: Record<string, string> = { episode: 'episodes', video: 'shortform' };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const ptype = m.groups!.type!;
    let videoId = m.groups!.id!;
    const webpage = (await this._download_webpage(url, videoId, undefined, { fatal: false })) || '';
    const props = searchNextjsData(this, webpage, videoId) || {};
    const initialReduxState = try_get(props, (x) => (x.initialReduxState as Record<string, unknown>)) || {};
    const playerApiCache = (initialReduxState.playerApiCache as Record<string, unknown>) || {};
    let apiPath: string | undefined;
    let resp: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(playerApiCache)) {
      if (k.startsWith('/episodes/') || k.startsWith('/shortform/')) {
        apiPath = k;
        resp = v as Record<string, unknown>;
        break;
      }
    }
    if (!apiPath) {
      const pageProps = (props.pageProps || {}) as Record<string, unknown>;
      const episodeId = str_or_none(pageProps.episodeId);
      apiPath = `/${STVPlayerIE._PTYPE_MAP[ptype]}/${episodeId || videoId}`;
    }
    let result = resp.results as Record<string, unknown> | undefined;
    if (!result) {
      const json = await this._download_json<{ results: Record<string, unknown> }>(
        `https://player.api.stv.tv/v1${apiPath}`,
        videoId,
      );
      result = json.results;
    }
    const video = (result!.video as Record<string, unknown>) || {};
    videoId = String(video.id);
    const subtitles: Record<string, Subtitle[]> = {};
    const rawSubs = (result!._subtitles as Record<string, string>) || {};
    for (const [ext, subUrl] of Object.entries(rawSubs)) {
      (subtitles.en ||= []).push({ ext: ext === 'webvtt' ? 'vtt' : ext, url: subUrl });
    }
    const programme = (result!.programme as Record<string, unknown>) || {};
    if (programme.drmEnabled) this.report_warning(`DRM protected: ${videoId}`);
    return {
      ...this.url_result(
        smuggle_url(STVPlayerIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', videoId), { geo_countries: ['GB'] }),
        'BrightcoveNew',
        videoId,
      ),
      description: (result!.summary as string) || undefined,
      duration: float_or_none(video.length, 1000) ?? undefined,
      subtitles,
      view_count: int_or_none(result!.views) ?? undefined,
      series: (programme.name as string) || (programme.shortName as string) || undefined,
    };
  }
}
