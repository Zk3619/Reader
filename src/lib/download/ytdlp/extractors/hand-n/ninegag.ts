/** NineGagIE — ported from yt-dlp ninegag.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none, traverse_obj, unescapeHTML, url_or_none } from '../../utils';

export class NineGagIE extends InfoExtractor {
  static IE_NAME = '9gag';
  static IE_DESC = '9GAG';
  static _VALID_URL = /https?:\/\/(?:www\.)?9gag\.com\/gag\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const resp = await this._download_json<{ data?: { post?: Record<string, unknown> } }>(
      'https://9gag.com/v1/post',
      postId,
      'Downloading post JSON',
      {
        query: { id: postId },
        // 对齐 yt-dlp impersonate=True；无 JA3 时软降级普通 TLS
        impersonate: true,
        headers: {
          Accept: 'application/json',
          Referer: url,
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    );
    const post = resp.data?.post;
    if (!post || typeof post !== 'object') {
      throw new ExtractorError(
        'Unable to fetch 9GAG post metadata (API empty). Try enhanced TLS / check network.',
        { expected: true },
      );
    }
    if (post.type !== 'Animated') {
      this.raise_no_formats('The given url does not contain a video', true);
    }

    let duration: number | undefined;
    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    for (const [key, image] of Object.entries((post.images as Record<string, Record<string, unknown>>) || {})) {
      const imageUrl = url_or_none(image.url);
      if (!imageUrl) continue;
      const ext = determine_ext(imageUrl);
      const imageId = key.replace(/^image/, '');
      const common = {
        url: imageUrl,
        width: int_or_none(image.width) ?? undefined,
        height: int_or_none(image.height) ?? undefined,
      };
      if (ext === 'jpg' || ext === 'png') {
        const webpUrl = url_or_none(image.webpUrl);
        if (webpUrl) thumbnails.push({ id: `${imageId}-webp`, url: webpUrl });
        thumbnails.push({ id: imageId, ...common });
      } else if (ext === 'webm' || ext === 'mp4') {
        if (!duration) duration = int_or_none(image.duration) ?? undefined;
        const acodec = image.hasAudio === 0 ? 'none' : undefined;
        for (const vcodec of ['vp8', 'vp9', 'h265'] as const) {
          const cUrl = url_or_none(image[`${vcodec}Url`]);
          if (!cUrl) continue;
          formats.push({ ...common, format_id: `${imageId}-${vcodec}`, url: cUrl, vcodec, acodec });
        }
        formats.push({ ...common, ext, format_id: imageId, acodec });
      }
    }

    const section = traverse_obj(post, ['postSection', 'name']) as string | undefined;
    const tags: string[] = [];
    for (const tag of (post.tags as Array<{ key?: string }>) || []) {
      if (tag.key) tags.push(tag.key);
    }

    return {
      id: postId,
      title: unescapeHTML(String(post.title ?? '')) || postId,
      timestamp: int_or_none(post.creationTs) ?? undefined,
      duration,
      uploader: traverse_obj(post, ['creator', 'fullName']) as string | undefined,
      uploader_id: traverse_obj(post, ['creator', 'username']) as string | undefined,
      uploader_url: url_or_none(traverse_obj(post, ['creator', 'profileUrl'])) ?? undefined,
      formats,
      thumbnails,
      like_count: int_or_none(post.upVoteCount) ?? undefined,
      dislike_count: int_or_none(post.downVoteCount) ?? undefined,
      comment_count: int_or_none(post.commentsCount) ?? undefined,
      age_limit: post.nsfw === 1 ? 18 : undefined,
      categories: section ? [section] : undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}
