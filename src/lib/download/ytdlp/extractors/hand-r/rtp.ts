/** RTPIE — ported from yt-dlp rtp.py (main path) */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

export class RTPIE extends InfoExtractor {
  static IE_NAME = 'RTP';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rtp\.pt\/play\/(?:[^/#?]+\/)?(?<program_id>p\d+)\/(?<episode_id>e\d+)(?:\/[^/#?]+\/(?<asset_id>\d+))?/;

  protected _cleanupMediaUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.replace('/drm-fps/', '/hls/').replace('/drm-dash/', '/dash/');
  }

  protected async _extractFormats(mediaUrls: string[], displayId: string) {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const mediaUrl of new Set(mediaUrls.map((u) => this._cleanupMediaUrl(u)).filter(Boolean) as string[])) {
      const ext = determine_ext(mediaUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, mediaUrl, displayId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(mediaUrl, displayId, 'dash', undefined, false)));
      } else {
        formats.push({ url: mediaUrl, format_id: 'http' });
      }
    }
    return { formats, subtitles };
  }

  protected async _extractAsset(assetData: Record<string, unknown>, episodeId: string, episodeInfo: VideoInfo) {
    const assetId = String(assetData.asset_id || '');
    const assetUrls = (assetData.asset_url as Record<string, unknown>) || {};
    const mediaUrls = [
      url_or_none(assetUrls.hls as string),
      url_or_none(assetUrls.dash as string),
      url_or_none(traverse_obj(assetUrls, ['multibitrate', 'url_hls']) as string),
      url_or_none(traverse_obj(assetUrls, ['multibitrate', 'url_dash']) as string),
    ].filter(Boolean) as string[];
    const { formats, subtitles } = await this._extractFormats(mediaUrls, assetId);
    for (const sub of traverse_obj(assetUrls, ['subtitles', 'vtt_list', 'all']) as Array<Record<string, unknown>>) {
      const file = url_or_none(sub.file as string);
      if (!file) continue;
      mergeSubtitles(subtitles, { [String(sub.code || 'pt')]: [{ url: file, ext: 'vtt', name: sub.language as string | undefined }] });
    }
    return {
      ...episodeInfo,
      id: assetId,
      episode_id: episodeId,
      formats,
      subtitles,
      thumbnail: url_or_none(assetData.asset_thumbnail as string) ?? undefined,
      duration: int_or_none(assetData.asset_duration as number) ?? undefined,
      webpage_url: url_or_none(traverse_obj(assetData, ['web', 'url']) as string) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const programId = m.groups!.program_id!;
    const episodeId = m.groups!.episode_id!;
    const assetId = m.groups!.asset_id;
    const authToken = await this._download_json<{ result?: { auth_token?: string } }>(
      'https://www.rtp.pt/play/api/1/token',
      episodeId,
      undefined,
      { fatal: false },
    );
    const token = authToken.result?.auth_token;
    const episodeData = token
      ? await this._download_json<{ result?: Record<string, unknown> }>(
          `https://www.rtp.pt/play/api/1/get-episode/${programId.slice(1)}/${episodeId.slice(1)}`,
          assetId || episodeId,
          undefined,
          {
            query: { include_assets: 'true', include_webparams: 'true' },
            headers: { Authorization: `Bearer ${token}` },
            fatal: false,
          },
        )
      : { result: undefined };
    const result = episodeData.result || {};
    const ep = (result.episode as Record<string, unknown>) || {};
    const episodeInfo: VideoInfo = {
      id: episodeId,
      episode_id: episodeId,
      series_id: programId,
      title: (ep.episode_title || ep.program_title) as string | undefined,
      description: (ep.episode_description || ep.episode_summary) as string | undefined,
      timestamp: parseIso8601(ep.episode_air_date as string) ?? undefined,
      modified_timestamp: parseIso8601(ep.episode_lastchanged as string) ?? undefined,
      episode: ep.episode_title as string | undefined,
      episode_number: int_or_none(ep.episode_number as number) ?? undefined,
      season: ep.program_season as string | undefined,
      series: ep.program_title as string | undefined,
    };
    const assets = (result.assets as Array<Record<string, unknown>>) || [];
    if (!assets.length) {
      const webpage = await this._download_webpage(url, episodeId);
      const config = this._search_json(/window\.__INITIAL_STATE__\s*=\s*/, webpage, 'config', episodeId, { fatal: false });
      const fallbackUrl = url_or_none(traverse_obj(config, ['asset', 'streamUrl']) as string);
      if (fallbackUrl) {
        const { formats, subtitles } = await this._extractFormats([fallbackUrl], episodeId);
        return { ...episodeInfo, formats, subtitles };
      }
      throw new Error('Episode data not found in API response');
    }
    if (assetId) {
      const asset = assets.find((a) => String(a.asset_id) === assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);
      return this._extractAsset(asset, episodeId, episodeInfo);
    }
    if (assets.length > 1) {
      const entries = [];
      for (const asset of assets) entries.push(await this._extractAsset(asset, episodeId, episodeInfo));
      return this.playlist_result(entries, episodeId, episodeInfo.title);
    }
    return this._extractAsset(assets[0]!, episodeId, episodeInfo);
  }
}
