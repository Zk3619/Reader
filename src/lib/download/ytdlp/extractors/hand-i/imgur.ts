/**
 * Imgur family — ported from yt-dlp imgur.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  mimetype2ext,
  str_or_none,
  url_or_none,
} from '../../utils';
import { parseIso8601, protoRelative, stripOrNone } from './_helpers';

function removeDuplicateFormats(formats: Format[]): Format[] {
  const seen = new Set<string>();
  return formats.filter((f) => {
    const key = f.url || '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class ImgurBaseIE extends InfoExtractor {
  static IE_NAME = 'imgurbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _CLIENT_ID = '546c25a59c58ad7';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ImgurBaseIE is not a standalone extractor', { expected: true });
  }

  static imgurResult(itemId: string): VideoInfo {
    return {
      _type: 'url',
      id: itemId,
      title: itemId,
      url: `https://imgur.com/${itemId}`,
      extractor: 'Imgur',
      extractor_key: 'Imgur',
    };
  }

  protected async _callApi(endpoint: string, videoId: string, opts?: { fatal?: boolean }) {
    return this._download_json<Record<string, unknown>>(
      `https://api.imgur.com/post/v1/${endpoint}/${videoId}?client_id=${ImgurBaseIE._CLIENT_ID}&include=media,account`,
      videoId,
      undefined,
      opts,
    );
  }

  static getDescription(s: string | null | undefined): string | null {
    if (!s || s.includes('Discover the magic of the internet at Imgur')) return null;
    return s || null;
  }
}

export class ImgurIE extends ImgurBaseIE {
  static IE_NAME = 'imgur';
  static _VALID_URL =
    /https?:\/\/(?:i\.)?imgur\.com\/(?!(?:a|gallery|t|topic|r)\/)(?:[^/?#]+-)?(?<id>[a-zA-Z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._callApi('media', videoId);

    const media0 = ((data.media as Array<Record<string, unknown>>) || [])[0];
    const isVideo = media0?.type === 'video';
    const isAnimated = (media0?.metadata as Record<string, unknown> | undefined)?.is_animated;
    if (!isVideo && !isAnimated) {
      throw new ExtractorError(`${videoId} is not a video or animated image`, { expected: true });
    }

    const webpage =
      (await this._download_webpage(`https://i.imgur.com/${videoId}.gifv`, videoId, undefined, { fatal: false })) || '';

    let formats: Format[] = [];
    const media = ((data.media as Array<Record<string, unknown>>) || [])[0] || {};
    const mediaFmt: Format = {
      format_id: 'source',
      url: url_or_none(media.url) ?? undefined,
      ext: media.ext as string | undefined,
      width: int_or_none(media.width) ?? undefined,
      height: int_or_none(media.height) ?? undefined,
      filesize: int_or_none(media.size) ?? undefined,
    };
    const metadata = (media.metadata as Record<string, unknown>) || {};
    if (metadata.has_sound === false) mediaFmt.acodec = 'none';

    const mediaUrl = mediaFmt.url;
    if (mediaUrl) {
      if (!mediaFmt.ext) {
        mediaFmt.ext =
          mimetype2ext(media.mime_type as string | undefined) || determine_ext(mediaUrl, undefined) || undefined;
      }
      if (media.type === 'image') {
        mediaFmt.acodec = 'none';
        mediaFmt.preference = -10;
      }
      formats.push(mediaFmt);
    }

    const videoElements = this._search_regex(
      /<div class="video-elements">([\s\S]*?)<\/div>/,
      webpage,
      'video elements',
      null,
      false,
    );

    if (videoElements) {
      const ogSize = (mediaType: string): { width?: number; height?: number } => ({
        width: int_or_none(this._og_search_property(`${mediaType}:width`, webpage, undefined, false)) ?? undefined,
        height: int_or_none(this._og_search_property(`${mediaType}:height`, webpage, undefined, false)) ?? undefined,
      });
      let size = ogSize('video');
      if (!size.width && !size.height) size = ogSize('image');

      formats = [];
      for (const srcMatch of videoElements.matchAll(/<source\s+src="(?<src>[^"]+)"\s+type="(?<type>[^"]+)"/gi)) {
        const src = srcMatch.groups!.src!;
        const type = srcMatch.groups!.type!;
        formats.push({
          format_id: type.split('/')[1] || 'source',
          url: protoRelative(src) || src,
          ext: mimetype2ext(type) || undefined,
          ...size,
        });
      }

      const gifJson = this._search_json<{ gifUrl?: string; size?: number }>(
        /var\s+videoItem\s*=/,
        webpage,
        'GIF info',
        videoId,
        { transform_source: js_to_json, fatal: false },
      );
      if (gifJson?.gifUrl) {
        formats.push({
          url: protoRelative(gifJson.gifUrl) || gifJson.gifUrl,
          filesize: int_or_none(gifJson.size) ?? undefined,
          ...size,
          format_id: 'gif',
          preference: -10,
          ext: 'gif',
          acodec: 'none',
          vcodec: 'gif',
          container: 'gif',
        });
      }
    }

    const searchMeta = (names: string | string[]) =>
      this._html_search_meta(names, webpage, undefined, false);

    const twitterUrl = url_or_none(searchMeta('twitter:player:stream'));
    if (twitterUrl) {
      formats.push({
        format_id: 'twitter',
        url: twitterUrl,
        ext: mimetype2ext(searchMeta('twitter:player:stream:content_type') || undefined) || undefined,
        width: int_or_none(searchMeta('twitter:width')) ?? undefined,
        height: int_or_none(searchMeta('twitter:height')) ?? undefined,
      });
    }

    if (!formats.length) {
      this.raise_no_formats(`No sources found for video ${videoId}. Maybe a plain image?`, true);
    }
    formats = removeDuplicateFormats(formats);

    const account = (data.account as Record<string, unknown>) || {};
    const mediaMeta = (media.metadata as Record<string, unknown>) || {};
    const thumbnailUrl =
      searchMeta(['thumbnailUrl', 'twitter:image', 'og:image']) ||
      this._og_search_thumbnail(webpage) ||
      undefined;

    return {
      title: this._og_search_title(webpage, false) ?? undefined,
      description: ImgurBaseIE.getDescription(this._og_search_description(webpage) || undefined) ?? undefined,
      uploader_id: int_or_none(data.account_id) != null ? String(data.account_id) : undefined,
      uploader: stripOrNone(account.username) ?? undefined,
      uploader_url: url_or_none(account.avatar_url) ?? undefined,
      like_count: int_or_none(data.upvote_count) ?? undefined,
      dislike_count: int_or_none(data.downvote_count) ?? undefined,
      comment_count: int_or_none(data.comment_count) ?? undefined,
      age_limit: data.is_mature ? 18 : undefined,
      timestamp: parseIso8601(data.updated_at) ?? parseIso8601(data.created_at) ?? undefined,
      release_timestamp: parseIso8601(data.created_at) ?? undefined,
      ...(mediaMeta.title || mediaMeta.description || mediaMeta.duration
        ? {
            title: stripOrNone(mediaMeta.title as string) ?? undefined,
            description: ImgurBaseIE.getDescription(mediaMeta.description as string | undefined) ?? undefined,
            duration: float_or_none(mediaMeta.duration) ?? undefined,
            timestamp:
              parseIso8601(mediaMeta.updated_at) ?? parseIso8601(mediaMeta.created_at) ?? undefined,
            release_timestamp: parseIso8601(mediaMeta.created_at) ?? undefined,
          }
        : {}),
      id: videoId,
      formats,
      thumbnails: thumbnailUrl ? [{ url: thumbnailUrl }] : undefined,
      http_headers: { Accept: '*/*' },
    };
  }
}

export class ImgurGalleryBaseIE extends ImgurBaseIE {
  static IE_NAME = 'imgurgallerybase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _GALLERY = true;

  async _real_extract(url: string): Promise<VideoInfo> {
    let galleryId = this._match_id(url);
    const data = await this._callApi('albums', galleryId, { fatal: false });

    const info: Partial<VideoInfo> = {
      title: stripOrNone(data.title as string) ?? undefined,
      description: ImgurBaseIE.getDescription(data.description as string | undefined) ?? undefined,
    };

    if (data.is_album) {
      const items = ((data.media as Array<Record<string, unknown>>) || [])
        .filter((v) => v.type === 'video' || (v.metadata as Record<string, unknown>)?.is_animated)
        .map((v) => str_or_none(v.id))
        .filter(Boolean) as string[];

      let mediaId: string | null = null;
      const gallery = (this.constructor as typeof ImgurGalleryBaseIE)._GALLERY;
      if (gallery && items.length === 1) mediaId = items[0]!;

      if (!mediaId) {
        const result = this.playlist_result(
          items.map((id) => ImgurBaseIE.imgurResult(id)),
          galleryId,
        );
        return { ...result, ...info };
      }
      galleryId = mediaId;
    }

    const result = ImgurBaseIE.imgurResult(galleryId);
    return {
      ...result,
      ...info,
      _type: 'url_transparent',
    };
  }
}

export class ImgurGalleryIE extends ImgurGalleryBaseIE {
  static IE_NAME = 'imgur:gallery';
  static _VALID_URL =
    /https?:\/\/(?:i\.)?imgur\.com\/(?:gallery|(?:t(?:opic)?|r)\/[^/?#]+)\/(?:[^/?#]+-)?(?<id>[a-zA-Z0-9]+)/;
  static _GALLERY = true;
}

export class ImgurAlbumIE extends ImgurGalleryBaseIE {
  static IE_NAME = 'imgur:album';
  static _VALID_URL = /https?:\/\/(?:i\.)?imgur\.com\/a\/(?:[^/?#]+-)?(?<id>[a-zA-Z0-9]+)/;
  static _GALLERY = false;
}
