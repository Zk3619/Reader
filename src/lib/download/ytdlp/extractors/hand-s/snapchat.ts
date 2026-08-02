/** SnapchatSpotlightIE — ported from yt-dlp snapchat.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, url_or_none, traverse_obj } from '../../utils';
import { searchNextjsData } from './_helpers';

export class SnapchatSpotlightIE extends InfoExtractor {
  static IE_NAME = 'snapchat';
  static _VALID_URL = /https?:\/\/(?:www\.)?snapchat\.com\/spotlight\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageProps = (searchNextjsData(this, webpage, videoId).pageProps || {}) as Record<string, unknown>;
    const spotlightFeed = pageProps.spotlightFeed as Record<string, unknown> | undefined;
    const stories = (spotlightFeed?.spotlightStories as Array<Record<string, unknown>>) || [];
    let videoData: Record<string, unknown> | undefined;
    for (const item of stories) {
      const story = item.story as Record<string, unknown> | undefined;
      const sid = traverse_obj(story, ['storyId', 'value']);
      if (String(sid) === videoId) {
        videoData = item.metadata as Record<string, unknown>;
        break;
      }
    }
    const vm = (videoData?.videoMetadata || {}) as Record<string, unknown>;
    const creator = (vm.creator as Record<string, unknown>)?.personCreator as Record<string, unknown> | undefined;
    const engagement = (videoData?.engagementStats || {}) as Record<string, unknown>;
    const viewFromEngagement = int_or_none(engagement.viewCount);
    const viewFromMeta = int_or_none(vm.viewCount);
    const viewCount = (viewFromEngagement ?? viewFromMeta ?? undefined);
    const normalizedView =
      viewCount === -1 ? undefined : viewCount;
    return {
      id: videoId,
      ext: 'mp4',
      title: String(vm.name || videoId),
      description: String(videoData?.description || vm.description || ''),
      timestamp: float_or_none(vm.uploadDateMs, 1000) ?? undefined,
      view_count: normalizedView,
      repost_count: int_or_none(engagement.shareCount ?? vm.shareCount) ?? undefined,
      url: url_or_none(vm.contentUrl) || undefined,
      width: int_or_none(vm.width) ?? undefined,
      height: int_or_none(vm.height) ?? undefined,
      duration: float_or_none(vm.durationMs, 1000) ?? undefined,
      thumbnail: url_or_none(vm.thumbnailUrl) || undefined,
      uploader: creator?.username ? String(creator.username) : undefined,
      uploader_url: url_or_none(creator?.url) || undefined,
      tags: Array.isArray(videoData?.hashtags)
        ? (videoData!.hashtags as unknown[]).map(String)
        : undefined,
    };
  }
}
