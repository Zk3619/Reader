/** TBSIE + TurnerBaseIE ù?ported from yt-dlp tbs.py / turner.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_qs, str_or_none, update_url_query } from '../../utils';
import { make_archive_id, strip_or_none } from './_helpers';

const AKAMAI_SPE_TOKEN_CACHE: Record<string, string> = {};

const SITE_INFO: Record<string, [string, string]> = {
  tbs: [
    'TBS',
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJkZTA0NTYxZS1iMTFhLTRlYTgtYTg5NC01NjI3MGM1NmM2MWIiLCJuYmYiOjE1MzcxODkzOTAsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTM3MTg5MzkwfQ.Z7ny66kaqNDdCHf9Y9KsV12LrBxrLkGGxlYe2XGm6qsw2T-k1OCKC1TMzeqiZP735292MMRAQkcJDKrMIzNbAuf9nCdIcv4kE1E2nqUnjPMBduC1bHffZp8zlllyrN2ElDwM8Vhwv_5nElLRwWGEt0Kaq6KJAMZA__WDxKWC18T-wVtsOZWXQpDqO7nByhfj2t-Z8c3TUNVsA_wHgNXlkzJCZ16F2b7yGLT5ZhLPupOScd3MXC5iPh19HSVIok22h8_F_noTmGzmMnIRQi6bWYWK2zC7TQ_MsYHfv7V6EaG5m1RKZTV6JAwwoJQF_9ByzarLV1DGwZxD9-eQdqswvg',
  ],
  tntdrama: [
    'TNT',
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIwOTMxYTU4OS1jZjEzLTRmNjMtYTJmYy03MzhjMjE1NWU5NjEiLCJuYmYiOjE1MzcxOTA4MjcsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTM3MTkwODI3fQ.AucKvtws7oekTXi80_zX4-BlgJD9GLvlOI9FlBCjdlx7Pa3eJ0AqbogynKMiatMbnLOTMHGjd7tTiq422unmZjBz70dhePAe9BbW0dIo7oQ57vZ-VBYw_tWYRPmON61MwAbLVlqROD3n_zURs85S8TlkQx9aNx9x_riGGELjd8l05CVa_pOluNhYvuIFn6wmrASOKI1hNEblBDWh468UWP571-fe4zzi0rlYeeHd-cjvtWvOB3bQsWrUVbK4pRmqvzEH59j0vNF-ihJF9HncmUicYONe47Mib3elfMok23v4dB1_UAlQY_oawfNcynmEnJQCcqFmbHdEwTW6gMiYsA',
  ],
  trutv: [
    'truTV',
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhYzQyOTkwMi0xMDYzLTQyNTQtYWJlYS1iZTY2ODM4MTVmZGIiLCJuYmYiOjE1MzcxOTA4NjgsImlzcyI6ImF1dGguYWRvYmUuY29tIiwiaWF0IjoxNTM3MTkwODY4fQ.ewXl5LDMDvvx3nDXV4jCdSwUq_sOluKoOVsIjznAo6Zo4zrGe9rjlZ9DOmQKW66g6VRMexJsJ5vM1EkY8TC5-YcQw_BclK1FPGO1rH3Wf7tX_l0b1BVbSJQKIj9UgqDp_QbGcBXz24kN4So3U22mhs6di9PYyyfG68ccKL2iRprcVKWCslIHwUF-T7FaEqb0K57auilxeW1PONG2m-lIAcZ62DUwqXDWvw0CRoWI08aVVqkkhnXaSsQfLs5Ph1Pfh9Oq3g_epUm9Ss45mq6XM7gbOb5omTcKLADRKK-PJVB_JXnZnlsXbG0ttKE1cTKJ738qu7j4aipYTf-W0nKF5Q',
  ],
};

export class TurnerBaseIE extends InfoExtractor {
  static IE_NAME = 'turnerbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TurnerBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _addAkamaiSpeToken(
    videoUrl: string,
    contentId: string,
    tokenizerQuery: Record<string, string>,
    authRequired = false,
  ): Promise<string> {
    const securePath = `${videoUrl.match(/https?:\/\/[^/]+(.+\/)/)?.[1] || '/'}*`;
    let token = AKAMAI_SPE_TOKEN_CACHE[securePath];
    if (!token) {
      const query: Record<string, string> = { path: securePath, ...tokenizerQuery, videoId: contentId };
      if (authRequired) this.report_warning('Auth-required Turner stream; token may fail without AdobePass');
      const authText = await this._download_webpage('https://token.ngtv.io/token/token_spe', contentId, undefined, { query });
      token = authText.match(/<token>([^<]+)<\/token>/)?.[1]?.trim() || '';
      if (token) AKAMAI_SPE_TOKEN_CACHE[securePath] = token;
    }
    return token ? update_url_query(videoUrl, { hdnea: token }) : videoUrl;
  }

  protected async _extractNgtvInfo(
    mediaId: string,
    tokenizerQuery: Record<string, string>,
    _softwareStatement: string | null,
    apData: { url?: string; site_name?: string; auth_required?: boolean; is_live?: boolean } = {},
  ): Promise<Partial<VideoInfo>> {
    const streamsData = await this._download_json<{ media: { tv: Record<string, Record<string, unknown>> } }>(
      `https://medium.ngtv.io/media/${mediaId}/tv`,
      mediaId,
    );
    let duration: number | undefined;
    const formats: Format[] = [];
    const isLive = !!apData.is_live;
    for (const supportedType of ['unprotected', 'bulkaes'] as const) {
      const streamData = streamsData.media.tv[supportedType] || {};
      let m3u8Url = String(streamData.secureUrl || streamData.url || '');
      if (!m3u8Url) continue;
      if (streamData.playlistProtection === 'spe') {
        m3u8Url = await this._addAkamaiSpeToken(m3u8Url, mediaId, tokenizerQuery, !!apData.auth_required);
      }
      formats.push(
        ...(await this._extract_m3u8_formats(m3u8Url, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
      duration = float_or_none(streamData.totalRuntime) ?? duration;
    }
    if (isLive) {
      for (const f of formats) {
        f.downloader_options = { ffmpeg_args: ['-seekable', '0', '-icy', '0'] };
      }
    }
    return { formats, duration };
  }
}

export class TBSIE extends TurnerBaseIE {
  static IE_NAME = 'tbs';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:www\.)?(?<site>tbs|tntdrama|trutv)\.com(?<path>/(?:` +
      String.raw`(?<watch>watch(?:tnt|tbs|trutv))|` +
      String.raw`movies|shows/[^/?#]+/(?:clips|season-\d+/episode-\d+)` +
      String.raw`)/(?<id>[^/?#]+))`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const path = m.groups!.path!;
    const displayId = m.groups!.id!;
    const isLive = !!m.groups!.watch;
    const webpage = await this._download_webpage(url, displayId);
    const drupalSettings = this._search_json<{
      turner_playlist: Array<Record<string, unknown>>;
      ngtv_token_url?: string;
      top2?: Record<string, unknown>;
    }>(/<script\b[^>]+\bdata-drupal-selector="drupal-settings-json"[^>]*>/, webpage, 'drupal settings', displayId)!;

    const videoData =
      drupalSettings.turner_playlist.find((v) => isLive || v.url === path) || drupalSettings.turner_playlist[0]!;
    const mediaId = String(videoData.mediaID);
    const title = String(videoData.title);
    const tokenizerQueryRaw = parse_qs(new URL(String(drupalSettings.ngtv_token_url || 'https://x/?')).search);
    const tokenizerQuery: Record<string, string> = {};
    for (const [k, v] of Object.entries(tokenizerQueryRaw)) tokenizerQuery[k] = v[v.length - 1] || '';

    const authInfo = (drupalSettings.top2 as Record<string, unknown>) || {};
    const siteName = str_or_none(authInfo.siteName) || SITE_INFO[site]![0];
    const softwareStatement = str_or_none(authInfo.softwareStatement) || SITE_INFO[site]![1];

    const info = await this._extractNgtvInfo(mediaId, tokenizerQuery, softwareStatement, {
      url,
      site_name: siteName,
      auth_required: videoData.authRequired === '1' || isLive,
      is_live: isLive,
    });

    const thumbnails: Thumbnail[] = [];
    for (const [imageId, image] of Object.entries((videoData.images as Record<string, Record<string, unknown>>) || {})) {
      const imageUrl = str_or_none(image.url);
      if (!imageUrl || image.type !== 'video') continue;
      const thumb: Thumbnail = { id: imageId, url: imageUrl };
      const dim = imageUrl.match(/(\d+)x(\d+)/);
      if (dim) {
        thumb.width = Number(dim[1]);
        thumb.height = Number(dim[2]);
      }
      thumbnails.push(thumb);
    }

    const result: VideoInfo = {
      ...info,
      id: mediaId,
      title,
      description:
        strip_or_none(videoData.descriptionNoTags) || strip_or_none(videoData.shortDescriptionNoTags) || undefined,
      duration: float_or_none(videoData.duration) ?? info.duration,
      timestamp: int_or_none(videoData.created) ?? undefined,
      season_number: int_or_none(videoData.season) ?? undefined,
      episode_number: int_or_none(videoData.episode) ?? undefined,
      thumbnails,
      is_live: isLive,
    };
    if (site === 'trutv') result._old_archive_ids = [make_archive_id('trutv', mediaId)];
    return result;
  }
}
