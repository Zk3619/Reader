// @ts-nocheck
/** YappyIE / YappyProfileIE â€?ported from yt-dlp yappy.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { htmlExtractTitle, searchNextjsData } from './_helpers';

export class YappyIE extends InfoExtractor {
  static IE_NAME = 'Yappy';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/yappy\.media\/video\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonLd = this._search_json_ld(webpage, videoId, { fatal: false });
    const nextjsData = searchNextjsData(this, webpage, videoId);

    let mediaData =
      (traverse_obj(nextjsData, ['pageProps', 'data'], { get_all: false }) as Record<
        string,
        unknown
      >) ||
      (traverse_obj(nextjsData, ['pageProps', 'OpenGraphParameters'], {
        get_all: false,
      }) as Record<string, unknown>) ||
      null;

    if (!mediaData) {
      mediaData = await this._download_json<Record<string, unknown>>(
        `https://yappy.media/api/video/${videoId}`,
        videoId,
      );
    }

    const mediaUrl = url_or_none(mediaData.link) || '';
    const hasWatermark = mediaUrl.endsWith('-wm.mp4');

    const formats: Format[] = mediaUrl
      ? [
          {
            url: mediaUrl,
            ext: 'mp4',
            format_note: hasWatermark ? 'Watermarked' : undefined,
            preference: hasWatermark ? -10 : undefined,
          },
        ]
      : [];

    if (hasWatermark) {
      formats.push({
        url: mediaUrl.replace('-wm.mp4', '.mp4'),
        ext: 'mp4',
      });
    }

    const audioLink = traverse_obj(mediaData, ['audio', 'link']);
    if (audioLink) {
      formats.push({
        url: String(audioLink),
        ext: 'mp3',
        acodec: 'mp3',
        vcodec: 'none',
      });
    }

    const catNames = traverse_obj(mediaData, ['categories', 'name']);
    const categories = Array.isArray(catNames)
      ? catNames.filter((x): x is string => typeof x === 'string')
      : undefined;

    return {
      id: videoId,
      title:
        (jsonLd.description as string | undefined) ||
        this._html_search_meta('og:title', webpage) ||
        htmlExtractTitle(webpage) ||
        videoId,
      formats,
      thumbnail:
        (mediaData.thumbnail != null ? String(mediaData.thumbnail) : undefined) ||
        this._html_search_meta(['og:image', 'og:image:secure_url'], webpage) ||
        undefined,
      description:
        (mediaData.description != null ? String(mediaData.description) : undefined) ||
        (jsonLd.description as string | undefined) ||
        this._html_search_meta(['description', 'og:description'], webpage) ||
        undefined,
      timestamp:
        unified_timestamp(mediaData.publishedAt || jsonLd.timestamp) ?? undefined,
      view_count:
        int_or_none(mediaData.viewsCount || jsonLd.view_count) ?? undefined,
      like_count: int_or_none(mediaData.likesCount) ?? undefined,
      uploader: traverse_obj(mediaData, ['creator', 'firstName']) as string | undefined,
      uploader_id:
        (traverse_obj(mediaData, ['creator', 'uuid']) as string | undefined) ||
        (traverse_obj(mediaData, ['creator', 'nickname']) as string | undefined),
      categories: categories?.length ? categories : undefined,
      repost_count: int_or_none(mediaData.sharingCount) ?? undefined,
    };
  }
}

export class YappyProfileIE extends InfoExtractor {
  static IE_NAME = 'YappyProfile';
  static _VALID_URL = /https?:\/\/yappy\.media\/profile\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const profileId = this._match_id(url);
    const entries: VideoInfo[] = [];

    for (let pageNum = 1; pageNum <= 100; pageNum++) {
      const videos = await this._download_json<{
        results?: Array<Record<string, unknown>>;
      }>(
        `https://yappy.media/api/video/list/${profileId}?page=${pageNum}`,
        profileId,
        `Downloading profile page ${pageNum} JSON`,
        { fatal: false },
      );

      const results = videos.results || [];
      if (!results.length) break;

      for (const video of results) {
        const uuid = video.uuid != null ? String(video.uuid) : null;
        if (!uuid) continue;
        entries.push(
          this.url_result(
            `https://yappy.media/video/${uuid}`,
            YappyIE.IE_NAME,
            uuid,
            video.description != null ? String(video.description) : undefined,
          ),
        );
      }
      if (results.length < 15) break;
    }

    return this.playlist_result(entries, profileId);
  }
}
