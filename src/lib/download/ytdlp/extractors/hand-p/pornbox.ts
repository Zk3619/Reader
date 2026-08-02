/** PornboxIE — ported from yt-dlp pornbox.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  str_or_none,
  url_or_none,
} from '../../utils';
import { parse_iso8601, qualityRank } from './_helpers';

const GET_QUALITY = qualityRank(['web', 'vga', 'hd', '1080p', '4k', '8k']);

export class PornboxIE extends InfoExtractor {
  static IE_NAME = 'pornbox';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?pornbox\.com\/application\/watch-page\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const publicData = await this._download_json<Record<string, unknown>>(
      `https://pornbox.com/contents/${videoId}`,
      videoId,
    );

    const subtitles: Record<string, Subtitle[]> = {};
    for (const code of (publicData.subtitles as string[]) || []) {
      subtitles[code] = [
        { url: `https://pornbox.com/contents/${videoId}/subtitles/${code}`, ext: 'srt' },
      ];
    }

    const price = (publicData.price as Record<string, unknown>) || {};
    const isFreeScene = Boolean(price.is_available_for_free);
    const studios = (publicData.studios as Record<string, unknown>) || {};

    const metadata: VideoInfo = {
      id: videoId,
      title: str_or_none(publicData.scene_name)?.trim(),
      description: str_or_none(publicData.small_description)?.trim(),
      uploader: publicData.studio as string | undefined,
      duration: parse_duration(publicData.runtime) ?? undefined,
      cast: [
        ...(((publicData.models as Array<{ model_name?: string }>) || []).map((m) => m.model_name) || []),
        ...(((publicData.male_models as Array<{ model_name?: string }>) || []).map((m) => m.model_name) || []),
      ].filter(Boolean) as string[],
      thumbnail: url_or_none(publicData.player_poster) ?? undefined,
      tags: ((publicData.niches as Array<{ niche?: string }>) || []).map((n) => n.niche).filter(Boolean) as string[],
      age_limit: 18,
      timestamp:
        parse_iso8601(studios.release_date as string) || parse_iso8601(publicData.publish_date as string) || undefined,
      availability: isFreeScene ? 'public' : 'premium_only',
      subtitles,
    };

    if (!publicData.is_purchased && !isFreeScene) {
      this.raise_login_required(
        'You are either not logged in or do not have access to this scene',
        metadata,
      );
    }

    const medias = (publicData.medias as Array<Record<string, unknown>>) || [];
    const fullVideo = medias.find((m) => m.title === 'Full video');
    const mediaId = fullVideo?.media_id;
    if (!mediaId) this.raise_no_formats('Could not find stream id');

    const streamData = await this._download_json<{ qualities?: Array<Record<string, unknown>> }>(
      `https://pornbox.com/media/${mediaId}/stream`,
      videoId,
      'Getting manifest urls',
    );

    const formats: Format[] = [];
    for (const q of streamData.qualities || []) {
      if (!q.src) continue;
      const quality = str_or_none(q.quality);
      const size = str_or_none(q.size);
      formats.push({
        url: String(q.src),
        format_id: quality || `q${formats.length}`,
        quality: quality ? GET_QUALITY(quality) : undefined,
        width: size ? int_or_none(size.slice(0, -1)) ?? undefined : undefined,
      });
    }
    metadata.formats = formats;
    return metadata;
  }
}
