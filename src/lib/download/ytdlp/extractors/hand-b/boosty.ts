/**
 * BoostyIE — ported from yt-dlp boosty.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { qualityRank } from './_helpers';

const MP4_TYPES = ['tiny', 'lowest', 'low', 'medium', 'high', 'full_hd', 'quad_hd', 'ultra_hd'];

export class BoostyIE extends InfoExtractor {
  static IE_NAME = 'boosty';
  static _VALID_URL = /https?:\/\/(?:www\.)?boosty\.to\/(?<user>[^/#?]+)\/posts\/(?<post_id>[^/#?]+)/;

  protected async _extractFormats(playerUrls: Array<Record<string, unknown>>, videoId: string): Promise<Format[]> {
    const formats: Format[] = [];
    const quality = qualityRank(MP4_TYPES);
    for (const playerUrl of playerUrls || []) {
      const url = url_or_none(playerUrl.url);
      if (!url) continue;
      const formatType = playerUrl.type as string | undefined;
      if (formatType && ['hls', 'hls_live', 'live_ondemand_hls', 'live_playback_hls'].includes(formatType)) {
        formats.push(...(await this._extract_m3u8_formats(url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      } else if (formatType && ['dash', 'dash_live', 'live_playback_dash'].includes(formatType)) {
        formats.push(...(await this._extract_mpd_formats(url, videoId, 'dash', undefined, false)));
      } else if (formatType && MP4_TYPES.includes(formatType)) {
        formats.push({ url, ext: 'mp4', format_id: formatType, quality: quality(formatType) });
      } else {
        this.report_warning(`Unknown format type: ${formatType}`);
      }
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const user = m.groups!.user!;
    const postId = m.groups!.post_id!;

    const post = await this._download_json<Record<string, unknown>>(
      `https://api.boosty.to/v1/blog/${user}/post/${postId}`,
      postId,
      'Downloading post data',
    );

    let postTitle = str_or_none(post.title);
    if (!postTitle) {
      this.report_warning('Unable to extract post title. Falling back to parsing html page');
      const webpage = await this._download_webpage(url, postId);
      postTitle = this._og_search_title(webpage) || null;
    }

    const user_ = (post.user as Record<string, unknown>) || {};
    const commonMetadata: Partial<VideoInfo> = {
      title: postTitle,
      channel: str_or_none(user_.name) || undefined,
      channel_id: str_or_none(user_.id) || undefined,
      timestamp: int_or_none(post.createdAt) ?? undefined,
      release_timestamp: int_or_none(post.publishTime) ?? undefined,
      modified_timestamp: int_or_none(post.updatedAt) ?? undefined,
      tags: ((post.tags as Array<Record<string, unknown>>) || []).map((t) => str_or_none(t.title)).filter(Boolean) as string[],
      like_count: int_or_none((post.count as Record<string, unknown>)?.likes) ?? undefined,
    };

    const entries: VideoInfo[] = [];
    for (const item of (post.data as Array<Record<string, unknown>>) || []) {
      const itemType = item.type;
      if (itemType === 'video' && url_or_none(item.url)) {
        entries.push(this.url_result(item.url as string, 'Youtube'));
      } else if (itemType === 'ok_video') {
        const videoId = str_or_none(item.id) || postId;
        entries.push({
          id: videoId,
          alt_title: postTitle,
          formats: await this._extractFormats((item.playerUrls as Array<Record<string, unknown>>) || [], videoId),
          ...commonMetadata,
          title: str_or_none(item.title) || postTitle,
          duration: int_or_none(item.duration) ?? undefined,
          view_count: int_or_none(item.viewsCounter) ?? undefined,
          thumbnail: url_or_none(item.preview) || url_or_none(item.defaultPreview) || undefined,
        } as VideoInfo);
      }
    }

    if (!entries.length && !post.hasAccess) {
      this.raise_login_required('This post requires a subscription');
    } else if (!entries.length) {
      throw new ExtractorError('No videos found', { expected: true });
    }
    if (entries.length === 1) return entries[0]!;
    return { ...this.playlist_result(entries, postId, postTitle, undefined), ...commonMetadata };
  }
}
