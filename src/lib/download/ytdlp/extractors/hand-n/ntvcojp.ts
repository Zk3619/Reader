/** NTVCoJpCUIE — ported from yt-dlp ntvcojp.py (Streaks API inline) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class NTVCoJpCUIE extends InfoExtractor {
  static IE_NAME = 'cu.ntv.co.jp';
  static IE_DESC = '日テレ無料TADA!';
  static _VALID_URL = /https?:\/\/cu\.ntv\.co\.jp\/(?!program-list|search)(?<id>[\w-]+)\/?(?:[?#]|$)/;

  protected async _extractFromStreaks(projectId: string, mediaId: string): Promise<Partial<VideoInfo>> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://playback.api.streaks.jp/v1/projects/${projectId}/medias/${mediaId}`,
      mediaId,
      undefined,
      {
        headers: {
          Accept: 'application/json',
          Origin: 'https://players.streaks.jp',
          'X-Streaks-Api-Key': 'df497719056b44059a0483b8faad1f4a',
        },
      },
    );
    const formats: Format[] = [];
    for (const source of (resp.sources as Array<Record<string, unknown>>) || []) {
      if (source.key_systems) continue;
      const src = str_or_none(source.src);
      if (!src) continue;
      if (src.includes('.m3u8')) {
        formats.push(...(await this._extract_m3u8_formats(src, mediaId, 'mp4')));
      } else {
        formats.push({ url: src, format_id: 'http' });
      }
    }
    return { id: str_or_none(resp.id) || mediaId, formats, live_status: 'not_live' };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const appData = this._search_json<{ falcorCache?: { catalog?: { episode?: Record<string, Record<string, unknown>> } } }>(
      /window\.app\s*=/,
      webpage,
      'video info',
      displayId,
    )!;
    const info = (appData.falcorCache?.catalog?.episode?.[displayId]?.value || {}) as Record<string, unknown>;
    const mediaId = str_or_none(traverse_obj(info, ['streaks_data', 'mediaid']));
    if (!mediaId) throw new ExtractorError('Unable to extract Streaks media ID', { expected: true });

    const streaks = await this._extractFromStreaks('ntv-tada', mediaId);
    const nonPhonetic = (items: unknown[]) =>
      (items.find((v) => (v as Record<string, unknown>)?.is_phonetic === false) as Record<string, unknown>)?.value;

    return {
      ...streaks,
      id: str_or_none(info.content_id) || displayId,
      title: str_or_none(nonPhonetic([info.title])) ?? undefined,
      age_limit: info.is_adult_only_content ? 18 : undefined,
      genres: ((info.genre as string[]) || []).map(String),
      release_timestamp: parseIso8601(info.pub_date) ?? undefined,
      tags: ((info.tags as string[]) || []).map(String),
      thumbnail: url_or_none(((info.artwork as Array<{ url?: string }>) || [])[0]?.url) ?? undefined,
      duration: int_or_none(traverse_obj(info, ['tv_episode_info', 'duration'])) ?? undefined,
      episode_number: int_or_none(traverse_obj(info, ['tv_episode_info', 'episode_number'])) ?? undefined,
      series: str_or_none(nonPhonetic([traverse_obj(info, ['tv_episode_info', 'parent_show_title'])])) ?? undefined,
      series_id: str_or_none(traverse_obj(info, ['tv_episode_info', 'show_content_id'])) ?? undefined,
      description: str_or_none(traverse_obj(info, ['custom_data', 'program_detail'])) ?? undefined,
      episode: str_or_none(traverse_obj(info, ['custom_data', 'episode_title'])) ?? undefined,
      uploader: str_or_none(traverse_obj(info, ['custom_data', 'network_name'])) ?? undefined,
      uploader_id: str_or_none(traverse_obj(info, ['custom_data', 'network_id'])) ?? undefined,
    };
  }
}
