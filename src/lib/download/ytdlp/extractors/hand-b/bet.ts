/**
 * BetIE — aligned with yt-dlp bet.py (MTVServicesBaseIE main path, non-provider-locked content)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

function findChildByType(children: unknown, type: string): Record<string, unknown> | undefined {
  if (!Array.isArray(children)) return undefined;
  return children.find((c) => c && typeof c === 'object' && (c as Record<string, unknown>).type === type) as
    | Record<string, unknown>
    | undefined;
}

export class BetIE extends InfoExtractor {
  static IE_NAME = 'bet';
  static _VALID_URL = /https?:\/\/(?:www\.)?bet\.com\/(?:video-clips|episodes)\/(?<id>[\da-z]{6})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);

    const noQueryUrl = url.split('?')[0]!;
    const data = await this._download_json<Record<string, unknown>>(noQueryUrl, displayId, undefined, {
      query: { json: 'true' },
    });

    const children = data.children as unknown[] | undefined;
    const mainContainer = findChildByType(children, 'MainContainer');
    let flexSource: Record<string, unknown> | undefined = mainContainer;
    if (mainContainer) {
      const aviaWrapper = findChildByType(mainContainer.children, 'AviaWrapper');
      if (aviaWrapper) flexSource = aviaWrapper;
    }
    const flexWrapper = flexSource ? findChildByType(flexSource.children, 'FlexWrapper') : undefined;

    let videoDetail: Record<string, unknown> | undefined;
    if (flexWrapper) {
      let playerSource: Record<string, unknown> = flexWrapper;
      const authWrapper = findChildByType(flexWrapper.children, 'AuthSuiteWrapper');
      if (authWrapper) playerSource = authWrapper;
      const player = findChildByType(playerSource.children, 'Player');
      videoDetail = (player?.props as Record<string, unknown>)?.videoDetail as Record<string, unknown> | undefined;
    }
    if (!videoDetail) {
      for (const child of children || []) {
        const c = (child || {}) as Record<string, unknown>;
        const cand = (c.handleTVEAuthRedirection as Record<string, unknown>) || c;
        if (cand?.videoDetail) {
          videoDetail = cand.videoDetail as Record<string, unknown>;
          break;
        }
      }
    }
    if (!videoDetail) throw new ExtractorError('Unable to extract video detail', { expected: true });

    const mgid = str_or_none(videoDetail.mgid) || '';
    const videoId = mgid.split(':').pop() || displayId;
    const rawServiceUrl = url_or_none(videoDetail.videoServiceUrl);
    if (!rawServiceUrl) throw new ExtractorError('This content is no longer available', { expected: true });
    const serviceUrl = rawServiceUrl.split('?')[0]!;

    if (videoDetail.authRequired) {
      this.raise_login_required('This video requires provider sign-in');
    }

    const streamData = await this._download_json<Record<string, unknown>>(
      serviceUrl,
      videoId,
      'Downloading API JSON',
      { query: { clientPlatform: 'desktop' } },
    );
    const streamInfo = (streamData.stitchedstream as Record<string, unknown>) || {};
    const manifestType = str_or_none(streamInfo.manifesttype);

    let formats: Format[] = [];
    if (manifestType === 'hls') {
      formats = await this._extract_m3u8_formats(
        String(streamInfo.source),
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        manifestType,
        undefined,
        false,
      );
    } else if (manifestType === 'dash') {
      formats = await this._extract_mpd_formats(String(streamInfo.source), videoId, manifestType, undefined, false);
    } else {
      this.raise_no_formats(`Unsupported manifest type "${manifestType}"`);
    }

    const images = (videoDetail.images as Record<string, unknown>[]) || [];
    const thumbnails: Thumbnail[] = images
      .map((im) => url_or_none(im?.url))
      .filter((u): u is string => !!u)
      .map((u) => ({ url: u }));

    const channel = str_or_none((videoDetail.channel as Record<string, unknown>)?.name) || undefined;
    const series = str_or_none((videoDetail.parentEntity as Record<string, unknown>)?.title) || undefined;

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title: str_or_none(videoDetail.title) || displayId,
      channel,
      thumbnails,
      description:
        str_or_none(videoDetail.fullDescription) || str_or_none(videoDetail.description) || null,
      series,
      season_number: int_or_none((videoDetail as Record<string, unknown>).seasonNumber) ?? undefined,
      episode_number: int_or_none((videoDetail as Record<string, unknown>).episodeAiringOrder) ?? undefined,
      duration:
        float_or_none((videoDetail.duration as Record<string, unknown>)?.milliseconds, 1000) ?? undefined,
      timestamp:
        parseIso8601(videoDetail.originalPublishDate) ??
        int_or_none((videoDetail.publishDate as Record<string, unknown>)?.timestamp) ??
        undefined,
      release_timestamp:
        parseIso8601(videoDetail.originalAirDate) ??
        int_or_none((videoDetail.airDate as Record<string, unknown>)?.timestamp) ??
        undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'bet',
      extractor_key: 'Bet',
    };
  }
}
