/** SevenPlusIE — ported from yt-dlp sevenplus.py (Brightcove main path) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, update_url_query } from '../../utils';

function mimetypeExt(type: unknown): string {
  const t = String(type || '').toLowerCase();
  if (t.includes('mpegurl') || t.includes('m3u8')) return 'm3u8';
  if (t.includes('dash')) return 'mpd';
  return 'mp4';
}

export class SevenPlusIE extends InfoExtractor {
  static IE_NAME = '7plus';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?7plus\.com\.au\/(?<path>[^?]+\?.*?\bepisode-id=(?<id>[^&#]+))/;

  protected token: string | null = null;

  async _real_initialize(): Promise<void> {
    this.token = null;
    const cookies = this._get_cookies('https://7plus.com.au');
    const apiKey = Object.keys(cookies).find((k) => k.startsWith('glt_'))?.slice(4);
    if (!apiKey) return;

    const loginResp = await this._download_json<{ errorMessage?: string; id_token?: string }>(
      'https://login.7plus.com.au/accounts.getJWT',
      undefined,
      'Logging in',
      {
        fatal: false,
        query: {
          APIKey: apiKey,
          sdk: 'js_latest',
          login_token: cookies[`glt_${apiKey}`]!,
          authMode: 'cookie',
          pageURL: 'https://7plus.com.au/',
          sdkBuild: '12471',
          format: 'json',
        },
      },
    );
    if (loginResp?.errorMessage) {
      this.report_warning(`Unable to login: 7plus said: ${loginResp.errorMessage}`);
      return;
    }
    if (!loginResp?.id_token) {
      this.report_warning('Unable to login: Could not extract id token');
      return;
    }
    const tokenResp = await this._download_json<{ token?: string }>(
      'https://7plus.com.au/auth/token',
      undefined,
      'Getting auth token',
      {
        fatal: false,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ idToken: loginResp.id_token, platformId: 'web', regSource: '7plus' }),
      },
    );
    this.token = tokenResp?.token || null;
    if (!this.token) this.report_warning('Unable to log in: Could not extract auth token');
  }

  protected async parseBrightcoveMetadata(jsonData: Record<string, unknown>, videoId: string): Promise<VideoInfo> {
    const formats: Format[] = [];
    for (const source of (jsonData.sources as Record<string, unknown>[]) || []) {
      const ext = mimetypeExt(source.type);
      const src = String(source.src || source.streaming_src || '');
      if (!src) continue;
      if (ext === 'm3u8') {
        formats.push(...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(src, videoId, 'dash', undefined, false)));
      } else {
        formats.push({ url: src, format_id: `http-${formats.length}`, ext: ext || 'mp4' });
      }
    }
    return {
      id: videoId,
      title: String(jsonData.name || videoId),
      description: String(jsonData.description || '') || undefined,
      thumbnail: String(jsonData.poster || jsonData.thumbnail || '') || undefined,
      duration: float_or_none(jsonData.duration, 1000) ?? undefined,
      timestamp: jsonData.published_at ? Date.parse(String(jsonData.published_at)) / 1000 : undefined,
      uploader_id: jsonData.account_id != null ? String(jsonData.account_id) : undefined,
      formats: this._sort_formats(formats),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const m = this._match_valid_url(url)!;
    const path = m.groups!.path!;
    const episodeId = m.groups!.id!;

    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let media: Record<string, unknown>;
    try {
      const playback = await this._download_json<{ media?: Record<string, unknown> }>(
        'https://videoservice.swm.digital/playback',
        episodeId,
        undefined,
        {
          query: {
            appId: '7plus',
            deviceType: 'web',
            platformType: 'web',
            accountId: '5303576322001',
            referenceId: `ref:${episodeId}`,
            deliveryId: 'csai',
            videoType: 'vod',
          },
          headers,
        },
      );
      media = playback.media || {};
    } catch (e) {
      const err = e as { cause?: { status?: number; body?: string } };
      if (err.cause?.status === 403) {
        throw new ExtractorError(JSON.parse(err.cause.body || '[]')[0]?.error_code || '403 Forbidden', {
          expected: true,
        });
      }
      throw e;
    }

    for (const source of (media.sources as Record<string, unknown>[]) || []) {
      const src = source.src as string | undefined;
      if (src) source.src = update_url_query(src, { rule: '' });
    }

    const info = await this.parseBrightcoveMetadata(media, episodeId);
    const content = await this._download_json<{ items?: Array<Record<string, unknown>> }>(
      `https://component-cdn.swm.digital/content/${path}`,
      episodeId,
      undefined,
      { headers: { 'market-id': '4' }, fatal: false },
    );

    for (const item of content?.items || []) {
      if (item.componentData && (item.componentData as Record<string, unknown>).componentType === 'infoPanel') {
        if (item.title) info.title = String(item.title);
        if (item.shortSynopsis) info.description = String(item.shortSynopsis);
        const seriesLogo = item.seriesLogo as Record<string, unknown> | undefined;
        if (seriesLogo?.name) info.series = String(seriesLogo.name);
        const titleM = /^S(\d+)\s+E(\d+)\s+-\s+(.+)$/.exec(String(info.title || ''));
        if (titleM) {
          info.season_number = int_or_none(titleM[1]) ?? undefined;
          info.episode_number = int_or_none(titleM[2]) ?? undefined;
          info.episode = titleM[3];
        }
      }
    }
    return info;
  }
}
