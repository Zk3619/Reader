/**
 * BeaconTvIE — aligned with yt-dlp beacon.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none } from '../../utils';
import { parseIso8601, parseJwplayerData, searchNextjsData } from './_helpers';

export class BeaconTvIE extends InfoExtractor {
  static IE_NAME = 'beacon';
  static _VALID_URL = /https?:\/\/(?:www\.)?beacon\.tv\/content\/(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const nextjsProps = searchNextjsData(this, webpage, videoId);
    const pageProps = (nextjsProps.pageProps as Record<string, unknown>) || {};
    const apolloState = (pageProps.__APOLLO_STATE__ as Record<string, unknown>) || {};

    let contentData: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(apolloState)) {
      if (!key.startsWith('Content:')) continue;
      const v = value as Record<string, unknown>;
      if (str_or_none(v?.slug) === videoId) {
        contentData = v;
        break;
      }
    }
    if (!contentData) throw new ExtractorError('Failed to extract content data');

    const contentVideo = contentData.contentVideo as Record<string, unknown> | undefined;
    const contentVideoData = contentVideo?.video as Record<string, unknown> | undefined;
    const contentPodcast = contentData.contentPodcast as Record<string, unknown> | undefined;
    const contentPodcastData = contentPodcast?.podcast as Record<string, unknown> | undefined;
    const rawJwplayer =
      str_or_none(contentVideoData?.videoData) || str_or_none(contentPodcastData?.audioData);

    let jwplayerData: Record<string, unknown> | null = null;
    if (rawJwplayer) {
      try {
        jwplayerData = JSON.parse(rawJwplayer);
      } catch {
        jwplayerData = null;
      }
    }

    if (!jwplayerData) {
      const contentType = str_or_none(contentData.contentType);
      if (!contentType || !['videoPodcast', 'video', 'podcast'].includes(contentType)) {
        throw new ExtractorError('Content is not a video/podcast', { expected: true });
      }
      const tierRef = str_or_none((contentData.contentTier as Record<string, unknown>)?.__ref);
      if (tierRef !== 'MemberTier:65b258d178f89be87b4dc0a4') {
        this.raise_login_required('This video/podcast is for members only');
      }
      throw new ExtractorError('Failed to extract content');
    }

    const info = await parseJwplayerData(this, jwplayerData, videoId);
    return {
      ...info,
      title: str_or_none(contentData.title) || info.title || videoId,
      description: str_or_none(contentData.description) || info.description || null,
      timestamp: parseIso8601(contentData.publishedAt) ?? info.timestamp,
      webpage_url: url,
      original_url: url,
      extractor: 'beacon',
      extractor_key: 'BeaconTv',
    };
  }
}
