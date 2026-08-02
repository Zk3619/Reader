/** SubstackIE — ported from yt-dlp substack.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, js_to_json, str_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class SubstackIE extends InfoExtractor {
  static IE_NAME = 'substack';
  static _VALID_URL = /https?:\/\/[\w-]+\.substack\.com\/p\/(?<id>[\w-]+)/;

  protected async _extractVideoFormats(
    videoId: string,
    baseUrl: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const videoFormat of ['hls', 'mp4'] as const) {
      const videoUrl = new URL(`/api/v1/video/upload/${videoId}/src?type=${videoFormat}`, baseUrl).toString();
      if (videoFormat === 'hls') {
        const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'mp4');
        formats.push(...res.formats);
        Object.assign(subtitles, res.subtitles || {});
      } else {
        formats.push({ url: videoUrl, ext: videoFormat, format_id: videoFormat });
      }
    }
    return { formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const jsonStr = this._search_json<string>(
      /window\._preloads\s*=\s*JSON\.parse\(/,
      webpage,
      'json string',
      displayId,
      { transform_source: js_to_json },
    );
    if (!jsonStr) throw new Error('Unable to extract preloads JSON');
    const webpageInfo = this._parse_json<Record<string, unknown>>(jsonStr, displayId)!;
    let canonicalUrl = url;
    const domain = traverse_obj(webpageInfo, ['domainInfo', 'customDomain']) as string | undefined;
    if (domain) canonicalUrl = new URL(url).hostname === domain ? url : new URL(url).toString().replace(new URL(url).hostname, domain);
    const post = (webpageInfo.post as Record<string, unknown>) || {};
    const postType = String(post.type || '');
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    if (postType === 'podcast') {
      const fmt: Format = { url: String(post.podcast_url || ''), format_id: 'podcast' };
      if (!determine_ext(fmt.url, '')) {
        const resp = await this._request_webpage({ url: fmt.url || '' }, displayId, 'Resolving podcast file extension', {
          fatal: false,
        });
        if (resp) fmt.ext = determine_ext(resp.url, 'mp3');
      }
      formats.push(fmt);
    } else if (postType === 'video') {
      const videoUpload = post.videoUpload as Record<string, unknown>;
      const res = await this._extractVideoFormats(String(videoUpload.id), canonicalUrl);
      formats = res.formats;
      subtitles = res.subtitles;
    } else {
      this.raise_no_formats(`Page type "${postType}" is not supported`);
    }
    const pub = (webpageInfo.pub as Record<string, unknown>) || {};
    return {
      id: String(post.id),
      formats,
      subtitles,
      title: (post.title as string) || undefined,
      description: (post.description as string) || undefined,
      thumbnail: (post.cover_image as string) || undefined,
      uploader: (pub.name as string) || undefined,
      uploader_id: str_or_none(post.publication_id) || undefined,
      webpage_url: canonicalUrl,
    };
  }
}
