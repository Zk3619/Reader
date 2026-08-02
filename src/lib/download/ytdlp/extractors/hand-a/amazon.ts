/**
 * AmazonReviewsIE / AmazonStoreIE — aligned with yt-dlp amazon.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  get_element_by_class,
  js_to_json,
  url_or_none,
} from '../../utils';

function getElementByAttribute(attr: string, value: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)(?=[^>]*\\b${attr}\\s*=\\s*["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[2] ?? null;
}

function htmlExtractTitle(html: string): string | null {
  return clean_html(html.match(/<title\b[^>]*>([^<]+)<\/title>/i)?.[1] || null);
}

async function extractM3u8FormatsAndSubtitles(
  ie: InfoExtractor,
  manifestUrl: string,
  videoId: string,
): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
  const formats = await ie._extract_m3u8_formats(
    manifestUrl,
    videoId,
    'mp4',
    'm3u8_native',
    undefined,
    undefined,
    'hls',
    undefined,
    false,
  );
  return { formats, subtitles: {} };
}

export class AmazonStoreIE extends InfoExtractor {
  static IE_NAME = 'amazonstore';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?amazon\.(?:[a-z]{2,3})(?:\.[a-z]{2})?\/(?:[^/]+\/)?(?:dp|gp\/product)\/(?<id>[^/&#$?]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const retries = Number(this.params.extractor_retries ?? 3) || 3;
    let dataJson: Record<string, unknown> | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < retries; attempt++) {
      const webpage = await this._download_webpage(url, playlistId);
      try {
        dataJson = this._search_json<Record<string, unknown>>(
          /var\s?obj\s?=\s?jQuery\.parseJSON\('/,
          webpage,
          'data',
          playlistId,
          { transform_source: js_to_json },
        );
        if (dataJson) break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!dataJson) {
      throw new ExtractorError(
        `Unable to extract Amazon store data: ${(lastError as Error)?.message || lastError}`,
        { expected: true },
      );
    }

    const entries: VideoInfo[] = [];
    for (const video of (dataJson.videos as Record<string, unknown>[]) || []) {
      if (!video.isVideo || !video.url) continue;
      entries.push({
        id: String(video.marketPlaceID || video.id || playlistId),
        url: String(video.url),
        title: (video.title as string | undefined) ?? undefined,
        thumbnail: (video.thumbUrl as string | undefined) || (video.thumb as string | undefined),
        duration: video.durationSeconds as number | undefined,
        height: video.videoHeight != null ? Number(video.videoHeight) : undefined,
        width: video.videoWidth != null ? Number(video.videoWidth) : undefined,
      });
    }

    return this.playlist_result(
      entries,
      playlistId,
      (dataJson.title as string | undefined) ?? undefined,
    );
  }
}

export class AmazonReviewsIE extends InfoExtractor {
  static IE_NAME = 'amazonreviews';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?amazon\.(?:[a-z]{2,3})(?:\.[a-z]{2})?\/gp\/customer-reviews\/(?<id>[^/&#$?]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const retries = Number(this.params.extractor_retries ?? 3) || 3;
    let webpage = '';
    let reviewBody: string | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      webpage = await this._download_webpage(url, videoId);
      reviewBody = getElementByAttribute('data-hook', 'review-body', webpage);
      if (reviewBody) break;
      if (attempt + 1 >= retries) {
        this.report_warning('Review body was not found in webpage');
      }
    }

    if (!reviewBody) {
      throw new ExtractorError('Review body was not found in webpage', { expected: true });
    }

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    const manifestUrl = this._search_regex(
      /data-video-url="([^"]+)"/,
      reviewBody,
      'm3u8 url',
      null,
      false,
    );
    if (url_or_none(manifestUrl)) {
      const extracted = await extractM3u8FormatsAndSubtitles(this, manifestUrl!, videoId);
      formats.push(...extracted.formats);
      subtitles = extracted.subtitles;
    }

    const mp4Url = this._search_regex(
      /<input[^>]+\bvalue="([^"]+)"[^>]+\bclass="video-url"/,
      reviewBody,
      'mp4 url',
      null,
      false,
    );
    if (url_or_none(mp4Url)) {
      formats.push({
        url: mp4Url!,
        ext: 'mp4',
        format_id: 'http-mp4',
      });
    }

    if (!formats.length) {
      this.raise_no_formats('No video found for this customer review', true);
    }

    const reviewTitle = clean_html(getElementByAttribute('data-hook', 'review-title', webpage));
    const ratingHtml = getElementByAttribute('data-hook', 'review-star-rating', webpage) || '';
    const descriptionMatch = [...reviewBody.matchAll(
      /<span(?:\s+class="cr-original-review-content")?>(.+?)<\/span>/gs,
    )].pop();

    return {
      id: videoId,
      title: reviewTitle || htmlExtractTitle(webpage) || videoId,
      description: clean_html(descriptionMatch?.[1] || null),
      uploader: clean_html(get_element_by_class('a-profile-name', webpage)),
      average_rating: float_or_none(clean_html(ratingHtml)?.split(' ')[0]),
      thumbnail: this._search_regex(
        /data-thumbnail-url="([^"]+)"/,
        reviewBody,
        'thumbnail',
        null,
        false,
      ) || undefined,
      formats,
      subtitles,
      webpage_url: url,
      original_url: url,
      extractor: 'amazonreviews',
      extractor_key: 'AmazonReviews',
    };
  }
}
