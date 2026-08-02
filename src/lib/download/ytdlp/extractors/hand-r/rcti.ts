/** RCTIPlus* — ported from yt-dlp rcti.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj } from '../../utils';
import { strip_or_none } from './_helpers';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class RCTIPlusBaseIE extends InfoExtractor {
  static IE_NAME = 'RCTIPlusBase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _AUTH_KEY = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RCTIPlusBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _ensureAuth() {
    if (this._AUTH_KEY) return;
    const resp = await this._download_json<{ data?: { access_token?: string } }>(
      'https://api.rctiplus.com/api/v1/visitor?platform=web',
      'auth',
      'Fetching authorization key',
    );
    this._AUTH_KEY = resp.data?.access_token || '';
  }

  protected async _callApi(url: string, videoId: string, note?: string) {
    await this._ensureAuth();
    const json = await this._download_json<{ status?: { code?: number; message_client?: string }; data?: unknown; meta?: unknown }>(
      url,
      videoId,
      note,
      { headers: { Authorization: this._AUTH_KEY } },
    );
    if (json.status?.code !== 0) {
      throw new ExtractorError(`${this.constructor.name} said: ${json.status?.message_client}`, { expected: true });
    }
    return [json.data, json.meta] as const;
  }
}

export class RCTIPlusIE extends RCTIPlusBaseIE {
  static IE_NAME = 'RCTIPlus';
  static _VALID_URL =
    /https?:\/\/www\.rctiplus\.com\/(?:programs\/\d+?\/.+\/)?(?<type>episode|clip|extra|live-event|missed-event)\/(?<id>\d+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoType = m.groups!.type!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const apiVersion = videoType === 'missed-event' ? 'v2' : 'v1';
    const appierId = `23984824_${Math.floor(Math.random() * 1e10)}`;
    const [videoJson] = await this._callApi(
      `https://api.rctiplus.com/api/${apiVersion}/${videoType}/${videoId}/url?appierid=${appierId}`,
      displayId,
      'Downloading video URL JSON',
    );
    const vj = (videoJson as Record<string, unknown>) || {};
    const videoUrl = vj.url as string;
    const [videoMeta, metaPaths] = await this._callApi(
      `https://api.rctiplus.com/api/v1/${videoType}/${videoId}`,
      displayId,
      'Downloading video metadata',
    );
    const vm = (videoMeta as Record<string, unknown>) || {};
    const imagePath = (metaPaths as Record<string, string>)?.image_path || 'https://rstatic.akamaized.net/media/';
    const thumbnails: Thumbnail[] = [];
    if (vm.portrait_image) thumbnails.push({ id: 'portrait_image', url: `${imagePath}2000${vm.portrait_image}` });
    if (vm.landscape_image) thumbnails.push({ id: 'landscape_image', url: `${imagePath}2000${vm.landscape_image}` });
    const formats = (await extractM3u8FormatsAndSubtitles(this, videoUrl, displayId, 'hls')).formats;
    for (const f of formats) {
      if (f.url?.includes('akamaized') || f.url?.includes('cloudfront')) {
        f.http_headers = { ...(f.http_headers || {}), Referer: 'https://www.rctiplus.com/' };
      }
    }
    return {
      id: String(vm.product_id || vj.product_id || displayId),
      title: strip_or_none((vm.title || vm.name || vj.content_name || vj.assets_name) as string) ?? displayId,
      display_id: displayId,
      description: vm.summary as string | undefined,
      timestamp: int_or_none((vm.release_date || vj.start_date) as number) ?? undefined,
      duration: int_or_none(vm.duration as number) ?? undefined,
      categories: vm.genre ? [String(vm.genre)] : undefined,
      series: (vm.program_title || vj.program_title) as string | undefined,
      season_number: int_or_none(vm.season as number) ?? undefined,
      episode_number: int_or_none(vm.episode as number) ?? undefined,
      channel: vj.tv_name as string | undefined,
      channel_id: str_or_none(vj.tv_id as string) ?? undefined,
      formats,
      thumbnails,
      is_live: videoType === 'live-event',
    };
  }
}

export class RCTIPlusSeriesIE extends RCTIPlusBaseIE {
  static IE_NAME = 'RCTIPlusSeries';
  static _VALID_URL = /https?:\/\/www\.rctiplus\.com\/programs\/(?<id>\d+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const seriesId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const [data] = await this._callApi(`https://api.rctiplus.com/api/v1/program/${seriesId}`, displayId);
    const episodes = traverse_obj(data, ['seasons', 'all', 'episodes', 'all']) as Array<{ share_url?: string }>;
    const entries = (episodes || []).map((ep) => this.url_result(String(ep.share_url || ''), 'RCTIPlus'));
    return this.playlist_result(entries, seriesId, (data as Record<string, unknown>).title as string | undefined);
  }
}

export class RCTIPlusTVIE extends RCTIPlusBaseIE {
  static IE_NAME = 'RCTIPlusTV';
  static _VALID_URL = /https?:\/\/www\.rctiplus\.com\/live\/(?<id>\d+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(url.replace('/live/', '/live-event/'), 'RCTIPlus');
  }
}
